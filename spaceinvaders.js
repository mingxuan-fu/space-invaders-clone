"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const rxjs_1 = require("rxjs");
function spaceinvaders() {
    // Inside this function you will use the classes and functions 
    // from rx.js
    // to add visuals to the svg element in pong.html, animate them, and make them interactive.
    // Study and complete the tasks in observable exampels first to get ideas.
    // Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/ 
    // You will be marked on your functional programming style
    // as well as the functionality that you implement.
    // Document your code!  
    const GameConsts = {
        CanvasSize: 600,
    };
    class Tick {
        constructor(elapsed) {
            this.elapsed = elapsed;
        }
    }
    const clock = rxjs_1.interval(10).subscribe(() => console.log('hello'));
}
// the following simply runs your pong function on window load.  Make sure to leave it in place.
if (typeof window != 'undefined')
    window.onload = () => {
        spaceinvaders();
    };
const invaderPath = "m 79.00009,54.00429 0,10 10,0 0,-10 -10,0 z m -40,0 0,10 10,0 0,-10 -10,0 z m 0,40 20,0 0,10 -20,0 0,-10 z m 50,0 0,10 -20,0 0,-10 20,0 z m 0,-60 0,-10 10,0 0,10 -10,0 z m -50,0 10,0 0,10 30,0 0,-10 10,0 0,10 10,0 0,10 10,0 0,10 10,0 0,30 -10,0 0,-20 -10,0 0,20 -10,0 0,-10 -50,0 0,10 -10,0 0,-20 -10,0 0,20 -10,0 0,-30 10,0 0,-10 10,0 0,-10 10,0 0,-10 z m -10,-10 10,0 0,10 -10,0 0,-10 z";
//# sourceMappingURL=spaceinvaders.js.map