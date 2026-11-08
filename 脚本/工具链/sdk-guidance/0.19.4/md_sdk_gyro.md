<!-- builda-sdk-version: 0.19.4 -->
# Motion controls / Gyroscope

Public API:

- Motion controls / gyroscope (**not an SDK API**: use the browser `deviceorientation` event directly, but iOS has one authorization pattern you must copy exactly, **requires App ≥ 1.84.0**; see "Motion controls / gyroscope" below)

Motion controls / gyroscope (**not an SDK API**, iOS requires App ≥ 1.84.0): for tilt control, balance, racing steering and similar gameplay, listen directly to the browser's native `deviceorientation` event and read `beta` (front-back tilt) / `gamma` (left-right tilt). The SDK does not wrap this capability, and the data does not go through the platform bridge. On Android and desktop browsers, just listening yields data; **on iOS you must call `DeviceOrientationEvent.requestPermission()` once first**, otherwise not a single event is fired. From App 1.84.0 the platform silently grants this for the game (no system prompt of any kind), so the request is invisible to the player — but **you must explain the purpose on screen yourself**, so the player is not left confused. Apps below 1.84.0, and iOS 14 or lower, always get `denied`; **you must provide a touch fallback gameplay** (virtual joystick, dragging, etc.) — never show a black screen or get stuck on "please tilt your phone".

**Iron rule: the `requestPermission()` call itself must happen synchronously on the user gesture's call stack.** Moving the call after an `await` / `.then()` / timer leaves the gesture context, and WebKit throws `NotAllowedError`; awaiting its **return value** is fine. So a pure JS / HTML5 game only needs to put it inside the click handler:

```js
startBtn.addEventListener("click", async () => {
  const E = window.DeviceOrientationEvent;
  if (E && typeof E.requestPermission === "function") {     // iOS
    if ((await E.requestPermission()) !== "granted") return useTouchFallback();
  }
  window.addEventListener("deviceorientation", (e) => { tiltX = e.gamma || 0; tiltY = e.beta || 0; });
});
```

**Godot Web has two extra pitfalls**: ① `Input.get_gyroscope()` / `get_accelerometer()` always return a zero vector on Web exports — the engine only feeds sensor data on native Android/iOS; the Web platform is not wired up, so you must go through JS; ② Godot input is pushed into the engine queue by DOM listeners and replayed on the **next frame**, so calling `requestPermission()` in `_input` / a button callback has already left the gesture stack and will always fail. You therefore have to attach a one-shot DOM listener yourself to move the call back into a real gesture. Copy the snippet below as-is (**call `request_gyro()` as soon as loading completes; do not put it in an "enable motion controls" button callback** — with the listener attached early, the player's next tap, very likely the "start game" tap, completes authorization along the way; putting it in a button makes the player tap twice):

```gdscript
var gyro_granted := false
var tilt_x := 0.0   # left-right tilt gamma
var tilt_y := 0.0   # front-back tilt beta
var _gyro_cb: JavaScriptObject
var _gyro_state: JavaScriptObject

func request_gyro() -> void:
    if not OS.has_feature("web"):
        return
    _gyro_cb = JavaScriptBridge.create_callback(_on_gyro_result)   # must be stored as a member, or it gets garbage-collected
    JavaScriptBridge.eval("""
    window.__gyro = { beta: 0, gamma: 0 };
    window.__gyroRequest = function (cb) {
      var E = window.DeviceOrientationEvent;
      function listen() {
        window.addEventListener('deviceorientation', function (e) {
          window.__gyro.beta = e.beta || 0;
          window.__gyro.gamma = e.gamma || 0;
        });
      }
      if (!E) { cb(false); return; }
      if (typeof E.requestPermission !== 'function') { listen(); cb(true); return; }   // Android / desktop
      // iOS: requestPermission must be called synchronously on the gesture stack; attach a one-shot listener here and call it on the player's next tap.
      var once = function () {
        window.removeEventListener('pointerdown', once, true);
        window.removeEventListener('touchstart', once, true);
        E.requestPermission().then(function (s) {
          if (s === 'granted') listen();
          cb(s === 'granted');
        }).catch(function () { cb(false); });
      };
      window.addEventListener('pointerdown', once, true);
      window.addEventListener('touchstart', once, true);
    };
    """, true)
    _gyro_state = JavaScriptBridge.get_interface("window")
    _gyro_state.__gyroRequest(_gyro_cb)

func _on_gyro_result(args: Array) -> void:
    gyro_granted = bool(args[0])
    if not gyro_granted:
        pass   # use the touch fallback gameplay

func _process(_delta: float) -> void:
    if not gyro_granted:
        return
    var g = _gyro_state.__gyro
    tilt_x = float(g.gamma)
    tilt_y = float(g.beta)
```

Unity WebGL works the same way: `Input.gyro` is unavailable on WebGL, so write the same logic in a `.jslib` (one-shot `pointerdown` listener + `requestPermission`) and pass the values back to C#.

**Acceptance can only be done on real devices**: desktop browsers have no sensors, so local `builda dev` receives no `deviceorientation` events at all and cannot show right or wrong; a real Android device can verify the data but not the iOS authorization branch, and iOS `NotAllowedError` only reproduces on a real iOS device. Before motion-control gameplay goes live, you must run it once on a real iOS device and confirm the fallback gameplay works.
