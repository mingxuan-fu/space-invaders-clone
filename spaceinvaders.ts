import { fromEvent, interval, merge} from 'rxjs';
import { map, filter, scan} from 'rxjs/operators';

function spaceinvaders() {
    
    // constants used in the program
    const GameConsts = {
        CANVAS_SIZE: 600,
        BULLET_RADIUS: 3,
        BULLET_VELOCITY: 3,
        ALIEN_BULLET_VELOCITY: 1,
        ALIEN_BULLET_EXPIRE: 180 * 3,
        BULLET_EXPIRE: 180,
        BORDER_VECTOR: new Vec(600, 1000),
        SHIP_SPEED: 3,
        SHIP_INITIAL_LOCATION: new Vec(300, 550),
        INVADER_SPEED: 0.1,
        INVADER_RADIUS: 12,
        INVADER_ROWS: 5,
        INVADER_COLUMNS: 11,
        ALIEN_VICTORY_THREASHHOLD: 450,
        ALIEN_DOWN_MOVE_SIZE: 30,
        ALIEN_MIN_BORDER_DIST_RATIO: 0.03,
        MAX_ALIEN_SPEEDUP_FACTOR: 15,
        RANDOMISATION_SEED: 30423,
        TIME_BETWEEN_ALIEN_SHOT: 1500,
        TICKRATE: 100,
        ALIEN_INIT_LEFT_MARGIN: 80,
        ALIEN_INIT_TOP_MARGIN: 50,
        SPACE_BETWEEN_ALIENS: 10,
        SHIELD_START_LEFT_MARGIN: 90,
        NUMBER_OF_SHIELDS: 3,
        SPACE_BETWEEN_SHIELDS: 100,
        SHIELD_DIST_FROM_TOP: 470,
        SHIELD_WIDTH: 70,
        SHIELD_HEIGHT: 30,
        BULLET_DESTRUCTION_EXPAND_RATIO: 2,
        MAX_GAME_LEVEL: 5,
        KILL_SCORE_MULTIPLIER: 100,
        TIME_PAUSE_ON_ALIEN_HIT: 20,
        KILL_STREAK_MAX_TIME: 300,
        COMBO_FOR_SUPERSHIP: 6, // if you get 6 kills in 3 seconds, your ship will become a supership, 
        SUPERSHIP_DURATION: 400, // and shoot 3 larger bullets at once instead of 1 small bullet, and also invincible
        SUPERSHIP_BULLET_OFFSET: 15, // supership status lasts 4 seconds
        SUPERSHIP_BULLET_RADIUS_MULTIPLIER: 1.5
    }

    type Key = 'KeyA' | 'KeyD' | 'ArrowUp' | 'Space'
    type Event = 'keydown' | 'keyup'
    
    // initialises the streams for the game
    const
        gameClock = interval(1000 / GameConsts.TICKRATE) // convert ticks per second to miliseconds per tick
            .pipe(map(elapsed => new Tick(elapsed))),
        keyObservable = <T>(e: Event, k: Key, result: () => T) =>
            fromEvent<KeyboardEvent>(document, e)
                .pipe(
                    filter(({ code }) => code === k),
                    filter(({ repeat }) => !repeat),
                    map(result)),
        startLeftMove = keyObservable('keydown', 'KeyA', () => new Move(new Vec(-GameConsts.SHIP_SPEED, 0))),
        startRightMove = keyObservable('keydown', 'KeyD', () => new Move(new Vec(GameConsts.SHIP_SPEED, 0))),
        stopLeftMove = keyObservable('keyup', 'KeyA', () => new Move(new Vec(GameConsts.SHIP_SPEED, 0))),
        stopRightMove = keyObservable('keyup', 'KeyD', () => new Move(new Vec(-GameConsts.SHIP_SPEED, 0))),
        shoot = keyObservable('keydown', 'Space', () => new Shoot()),
        alienShoot = interval(GameConsts.TIME_BETWEEN_ALIEN_SHOT).pipe(map(_ => new AlienShoot()));

    // type definitions
    // derived and extended from asteroid sample code
    class AlienShoot { constructor() { } }
    class Tick { constructor(public readonly elapsed: number) { } }
    class Move { constructor(public readonly direction: Vec) { } }
    class Shoot { constructor() { } }
    type ViewType = 'ship' | 'shield' | 'invader' | 'playerBullet' | 'shield' | 'shieldDestruction' | "alienBullet" | 'superShip'
    type CircularBody = Readonly<CircularIBody>
    type RectangularBody = Readonly<RectangularIBody>
    type Rectangle = Readonly<{ pos: Vec, width: number, height: number }>
    type Circle = Readonly<{ pos: Vec, radius: number }>
    type ObjectId = Readonly<{ id: string, createTime: number }>
    interface CircularIBody extends Circle, ObjectId {
        viewType: ViewType,
        vel: Vec,
        instantMove: Vec,
    }
    interface RectangularIBody extends Rectangle, ObjectId {
        viewType: ViewType,
    }
    type State = Readonly<{
        time: number,
        ship: CircularBody,
        shields: ReadonlyArray<RectangularBody>,
        shieldDestruction: ReadonlyArray<CircularBody>,
        aliens: ReadonlyArray<CircularBody>,
        bullets: ReadonlyArray<CircularBody>,
        exit: ReadonlyArray<CircularBody>,
        gameOver: boolean,
        objectCount: number,
        victory: boolean,
        rng: RNG,
        score: number,
        level: number,
        lastHit: number,
        comboRecord: ReadonlyArray<number>,
        superShip: boolean,
        superShipStartTime: number
    }>

    // initalise the ship viewmodel
    const createShip = ():CircularBody => {
        return {
            id: 'ship',
            viewType: 'ship',
            pos: GameConsts.SHIP_INITIAL_LOCATION,
            vel: Vec.Zero,
            radius: 20,
            createTime: 0,
            instantMove: new Vec(0, 0)
        }
    }

    // create circular body
    const createCircle = (viewType: ViewType) => (oid: ObjectId) => (circ: Circle) => (vel: Vec) =>
        <CircularBody>{
            ...oid,
            ...circ,
            vel: vel,
            id: viewType + oid.id,
            viewType: viewType,
            instantMove: new Vec(0, 0)
        },
        createPlayerBullet = createCircle('playerBullet'),
        createAlienBullet = createCircle('alienBullet');

    // create a rectangular body
    const createRectangle = (viewType: ViewType) => (oid: ObjectId) => (circ: Rectangle) =>
        <RectangularBody>{
            ...oid,
            ...circ,
            id: viewType + oid.id,
            viewType: viewType,
        },
        createShield = createRectangle('shield'),
        createShieldDestruction = createCircle('shieldDestruction');

    // creates an array of aliens based on the grid specified in the game constants
    const createAliens = (): ReadonlyArray<CircularBody> => {
        return flatMap([...Array(GameConsts.INVADER_ROWS).keys()], (row) => {
            return [...Array(GameConsts.INVADER_COLUMNS)].map((_, col) => {
                return createCircle('invader')
                    ({ id: String(row * GameConsts.INVADER_COLUMNS + col), createTime: 0 })
                    ({
                        radius: GameConsts.INVADER_RADIUS,
                        pos: new Vec(
                            GameConsts.ALIEN_INIT_LEFT_MARGIN + col * (GameConsts.INVADER_RADIUS + GameConsts.SPACE_BETWEEN_ALIENS) * 2,
                            GameConsts.ALIEN_INIT_TOP_MARGIN + row * (GameConsts.INVADER_RADIUS + GameConsts.SPACE_BETWEEN_ALIENS) * 2)
                    })
                    (new Vec(GameConsts.INVADER_SPEED, 0))
            })
        })
    }

    // create an array of shields
    const createShields = (): ReadonlyArray<RectangularBody> => {
        return [...Array(GameConsts.NUMBER_OF_SHIELDS)].map((_, idx) => {
            return createShield({ id: String(GameConsts.INVADER_COLUMNS * GameConsts.INVADER_COLUMNS + idx), createTime: 0 })
                ({ pos: new Vec(GameConsts.SHIELD_START_LEFT_MARGIN + idx * (GameConsts.SHIELD_WIDTH + GameConsts.SPACE_BETWEEN_SHIELDS), GameConsts.SHIELD_DIST_FROM_TOP), width: GameConsts.SHIELD_WIDTH, height: GameConsts.SHIELD_HEIGHT })
        })
    }

    // inital state of the program
    const initialState: State = {
        time: 0,
        ship: createShip(),
        shields: createShields(),
        shieldDestruction: [],
        aliens: createAliens(),
        bullets: [],
        exit: [],
        gameOver: false,
        victory: false,
        objectCount: GameConsts.INVADER_COLUMNS * GameConsts.INVADER_COLUMNS + GameConsts.NUMBER_OF_SHIELDS,
        rng: new RNG(GameConsts.RANDOMISATION_SEED),
        score: 0,
        level: 1,
        lastHit: 0,
        comboRecord: [],
        superShip: false,
        superShipStartTime: -Infinity
    }

    // helper function to get the inital amount of aliens in the program
    const getInitialAlienAmount = () => GameConsts.INVADER_COLUMNS * GameConsts.INVADER_ROWS;

    /**
     * Moves bodies
     * @param o moveable circular body
     * @returns body after movement
     */
    const moveBody = (o: CircularBody) => <CircularBody>{
        ...o,
        pos: clampVec(o.pos.add(o.vel).add(o.instantMove), GameConsts.BORDER_VECTOR),
        vel: o.vel,
        instantMove: new Vec(0, 0)
    }

    /**
     * Ticks the state forward, aliens move, things collide, directions change, etc
     * @param s state of the program
     * @param elapsed current time since start of game
     * @returns state of program up to elapsed value
     */
    const tick = (s: State, elapsed: number) => { // derived and significantly extended from asteroid sample code
        const
            expired = (b: CircularBody) => (elapsed - b.createTime) > ((b.viewType === "playerBullet")? GameConsts.BULLET_EXPIRE: GameConsts.ALIEN_BULLET_EXPIRE),
            expiredBullets: CircularBody[] = s.bullets.filter(expired),
            activeBullets = s.bullets.filter(not(expired)),
            alienVic = s.aliens.some(alien => alien.pos.y > GameConsts.ALIEN_VICTORY_THREASHHOLD),
            victory = s.level === GameConsts.MAX_GAME_LEVEL && s.aliens.length === 0,
            startSuperShip = s.comboRecord.length >= GameConsts.COMBO_FOR_SUPERSHIP
        return handleCollisions(handleAlienSpeedUp(handleDirectionSwap({
            ...s,
            ship: (s.superShip) ? moveBody({...s.ship, viewType: 'superShip'}) : moveBody({...s.ship, viewType: 'ship'}),
            bullets: activeBullets.map(moveBody),
            aliens: 
            (s.aliens.length === 0 && !victory)? 
                createAliens() // create new aliens if aliens run out
            : 
                (elapsed - s.lastHit < GameConsts.TIME_PAUSE_ON_ALIEN_HIT)? 
                    s.aliens // don't move aliens in the alien pause period
                : 
                    s.aliens.map(moveBody),
            gameOver: alienVic || s.gameOver || s.victory,
            exit: expiredBullets,
            time: elapsed,
            level: s.level + ((s.aliens.length === 0 && !victory)? 1 : 0),
            victory: s.victory || victory,
            superShip: ((elapsed - s.superShipStartTime) < GameConsts.SUPERSHIP_DURATION)? s.superShip : startSuperShip,
            superShipStartTime: (startSuperShip) ? elapsed : s.superShipStartTime,
            comboRecord: s.comboRecord.filter((killTime) => ((s.time - killTime) < GameConsts.KILL_STREAK_MAX_TIME))
        })))
    }

    /**
     * Speeds up the aliens by a capped cubically growing value
     * @param s state of the program
     * @returns state of the program with alien speed managed
     */
    const handleAlienSpeedUp = (s: State): State => {
        const initialAliensCount = getInitialAlienAmount()
        const scaleFactor = (GameConsts.MAX_ALIEN_SPEEDUP_FACTOR * (initialAliensCount - s.aliens.length)**3 / initialAliensCount**3) + 1
        return { ...s, aliens: s.aliens.map(alien => ({ ...alien, vel: alien.vel.setLength(scaleFactor * GameConsts.INVADER_SPEED) })) }
    }

    /**
     * Swaps the direction of all aliens and move them downward if any of them is too close to the border of the game
     * @param s state of the program
     * @returns state of the program with alien direction managed
     */
    const handleDirectionSwap = (s: State): State => {
        if (
            s.aliens.filter(alien => ((alien.pos.x + alien.radius) > (GameConsts.CANVAS_SIZE * (1 - GameConsts.ALIEN_MIN_BORDER_DIST_RATIO))) && alien.vel.x > 0).length > 0
            ||
            s.aliens.filter(alien => ((alien.pos.x - alien.radius) < (GameConsts.CANVAS_SIZE * (GameConsts.ALIEN_MIN_BORDER_DIST_RATIO))) && alien.vel.x < 0).length > 0
        ) {
            return { ...s, aliens: s.aliens.map(alien => ({ ...alien, vel: alien.vel.scale(-1), pos: alien.pos.add(new Vec(0, GameConsts.ALIEN_DOWN_MOVE_SIZE)) })) };
        } else {
            return s
        }
    }

    // Helper functions for collision handling
    const 
        cut = except((a: CircularBody) => (b: CircularBody) => a.id === b.id),
        circularBodiesCollided = ([a, b]: [CircularBody, CircularBody]) => a.pos.sub(b.pos).len() < b.radius,
        rectangularBodiesCollied = ([a, b]: [RectangularBody, CircularBody]) => (
            between(b.pos.x, a.pos.x, a.pos.x + a.width) && between(b.pos.y, a.pos.y, a.pos.y + a.height)
        );

    /**
     * Manages shield collisions and have them handled
     * @param s state of the game
     * @returns tuple of the bullets to be removed and the new shield destructions from those bullets
     */
    const manageShieldCollision = (s: State): [ReadonlyArray<CircularBody>, ReadonlyArray<CircularBody>] => {
        const 
            bulletsColliedWithShields = 
            flatMap(s.shields, b => s.bullets.map<[RectangularBody, CircularBody]>(r => ([b, r])))
            .filter(rectangularBodiesCollied).map(([_, bullet]) => bullet),
            
            //remove collied bullets that is in destroyed shields
            colliedShieldBulletsNotInDestruction = 
            cut(bulletsColliedWithShields)(
                flatMap(bulletsColliedWithShields, b => s.shieldDestruction.map<[CircularBody, CircularBody]>(r => ([b, r])))
                .filter(circularBodiesCollided).map(([bullet, _]) => bullet)
            ),
            
            //generate shield destruction
            shieldDestruction = colliedShieldBulletsNotInDestruction
            .map((bullet, idx) =>
                createShieldDestruction
                    ({ id: String(s.objectCount + idx), createTime: s.time })
                    ({ pos: bullet.pos, radius: bullet.radius * GameConsts.BULLET_DESTRUCTION_EXPAND_RATIO })
                    (new Vec(0, 0))
            )

        return [colliedShieldBulletsNotInDestruction, shieldDestruction]
    }

    /**
     * Handles collision for the Game
     * @param s state of the game
     * @returns state of the game with collied aliens, bullets, shields, shield destructions managed
     */
    const handleCollisions = (s: State): State => { // derived and extended from asteroid sample code
        const
            shipCollided = s.bullets.filter(r => circularBodiesCollided([r, s.ship])).length > 0,
            allBulletsAndAliens = flatMap(s.bullets.filter((bullet)=>!(bullet.viewType === 'alienBullet')), b => s.aliens.map<[CircularBody, CircularBody]>(r => ([b, r]))),
            collidedBulletsAndAliens = allBulletsAndAliens.filter(circularBodiesCollided),
            collidedBullets = collidedBulletsAndAliens.map(([bullet, _]) => bullet),
            collidedAliens = collidedBulletsAndAliens.map(([_, rock]) => rock),
            [colliedShieldBullets, shieldDestruction] = manageShieldCollision(s);

        return <State>{
            ...s,
            bullets: cut(cut(s.bullets)(collidedBullets))(colliedShieldBullets),
            aliens: cut(s.aliens)(collidedAliens),
            exit: s.exit.concat(collidedAliens, collidedBullets, colliedShieldBullets),
            gameOver: s.gameOver || (shipCollided && !s.superShip),
            objectCount: s.objectCount + shieldDestruction.length,
            shieldDestruction: s.shieldDestruction.concat(shieldDestruction),
            score: s.score + collidedAliens.length * GameConsts.KILL_SCORE_MULTIPLIER,
            lastHit: (collidedAliens.length > 0)? s.time : s.lastHit,
            comboRecord: (s.superShip) ? //Combo can only accumulate when not in super ship mode
            [] 
            : 
            s.comboRecord.concat(Array(collidedAliens.length).fill(s.time)),
            
        }
    }

    /**
     * Get the list of aliens that is the lower most for their column
     * @param s state of the game
     * @returns list of aliens that is lower most for their column
     */
    const getFirstRowAliens = (s: State) => {
        const sortedAliens = [...s.aliens].sort((a1: CircularBody, a2: CircularBody): number => 
        (a1.pos.x > a2.pos.x) ? 
            1 
        :
            (a1.pos.x === a2.pos.x) ? 
                ((a1.pos.y < a2.pos.y) ? 
                    1 
                : 
                    -1
                )
            : 
                -1); 
        // Sorts aliens by x coordinate then the y coordinate, 
        // meaning that the first alien of each x coordinate is the lower most one (or the one with maximum y value)
        return sortedAliens.reduce((acc: Array<CircularBody>, alien: CircularBody) => {
            if (acc.length === 0) {
                return [alien];
            } else if (acc[acc.length - 1].pos.x === alien.pos.x) {
                return acc
            } else {
                return acc.concat([alien])
            }
        }, [])
        // reduce over the list of sorted aliens to extract only the lowermost ones for their column
    }

    /**
     * Get a random alien that is the lower most alien of that column
     * uses rng value from the state
     * @param s state of the program
     * @returns random first row alien
     */
    const randomFirstRowAliens = (s: State) => {
        const firstRowAliens = getFirstRowAliens(s);
        return firstRowAliens[Math.floor(firstRowAliens.length * s.rng.float())]
    }

    const reduceState = (s: State, e: Move | Tick | Shoot | AlienShoot): State => // derived and extended from asteroid sample code
        e instanceof Move ? { // handle ship movement
            ...s,
            //clamp to prevent the ship from getting stuck in one direction because of some key down not being mathced by key up
            ship: { ...s.ship, vel: clampVec(s.ship.vel.add(e.direction), new Vec(GameConsts.SHIP_SPEED, 0), new Vec(-GameConsts.SHIP_SPEED, 0)) },
            rng: s.rng.next(), // set next RNG value
        } :
        e instanceof Shoot ? { // handle player shooting
            ...s,
            rng: s.rng.next(), // set next RNG value
            bullets: (s.superShip)?  // if player is supership, create 3 bullets offset by supership bullet offset
            s.bullets.concat([
                ((unitVec: Vec) =>
                    createPlayerBullet({ id: String(s.objectCount), createTime: s.time })
                        ({ 
                            radius: GameConsts.BULLET_RADIUS* GameConsts.SUPERSHIP_BULLET_RADIUS_MULTIPLIER, 
                            pos: s.ship.pos.add(unitVec.scale(s.ship.radius)).sub(new Vec(GameConsts.SUPERSHIP_BULLET_OFFSET, 0)) 
                        })
                        (unitVec.scale(GameConsts.BULLET_VELOCITY))
                )(Vec.unitVecInDirection(0)),
                ((unitVec: Vec) =>
                    createPlayerBullet({ id: String(s.objectCount + 1), createTime: s.time })
                        ({ 
                            radius: GameConsts.BULLET_RADIUS* GameConsts.SUPERSHIP_BULLET_RADIUS_MULTIPLIER, 
                            pos: s.ship.pos.add(unitVec.scale(s.ship.radius)) 
                        })
                        (unitVec.scale(GameConsts.BULLET_VELOCITY))
                )(Vec.unitVecInDirection(0)),
                ((unitVec: Vec) =>
                    createPlayerBullet({ id: String(s.objectCount + 2), createTime: s.time })
                        ({ 
                            radius: GameConsts.BULLET_RADIUS* GameConsts.SUPERSHIP_BULLET_RADIUS_MULTIPLIER, 
                            pos: s.ship.pos.add(unitVec.scale(s.ship.radius)).sub(new Vec(-GameConsts.SUPERSHIP_BULLET_OFFSET, 0)) 
                        })
                        (unitVec.scale(GameConsts.BULLET_VELOCITY))
                )(Vec.unitVecInDirection(0))
            ])
            :    
            s.bullets.concat([
                ((unitVec: Vec) =>
                    createPlayerBullet({ id: String(s.objectCount), createTime: s.time })
                        ({ radius: GameConsts.BULLET_RADIUS, pos: s.ship.pos.add(unitVec.scale(s.ship.radius)) })
                        (unitVec.scale(GameConsts.BULLET_VELOCITY))
                )(Vec.unitVecInDirection(0))]),
            objectCount: s.objectCount + ((s.superShip)? 3 : 1)
        } :
        e instanceof AlienShoot ? { // handle alien shooting, spawn bullet in front of random first row alien
            ...s,
            rng: s.rng.next(), // set next RNG value
            bullets: (s.aliens.length > 0)? s.bullets.concat([
                ((unitVec: Vec) =>
                    createAlienBullet({ id: String(s.objectCount), createTime: s.time })
                        ({ radius: GameConsts.BULLET_RADIUS, pos: randomFirstRowAliens(s).pos.add(unitVec.scale(GameConsts.INVADER_RADIUS)) }) 
                        (unitVec.scale(GameConsts.ALIEN_BULLET_VELOCITY))
                )(Vec.unitVecInDirection(180))]) : s.bullets,
            objectCount: s.objectCount + 1
        } : // ticks state by time elapsed otherwise
            tick({ ...s, rng: s.rng.next()  /** set next RNG value */ }, e.elapsed)

    /**
     * Update the dom to match current view model
     * this is the only impure function in the program
     * @param s current state of program
     */
    function updateView(s: State) { // derived and extended from asteroid sample code
        const
            svg = document.getElementById("svgCanvas")!,
            ship = document.getElementById("ship")!,
            scoreDisplay = document.getElementById("scoreDisplay"),
            levelDisplay = document.getElementById("levelDisplay"),
            superShipDisplay = document.getElementById("superShipDisplay"),
            comboDisplay = document.getElementById("comboDisplay"),
            updateCircularBodyView = (b: CircularBody) => {
                function createBodyView() {
                    const v = document.createElementNS(svg.namespaceURI, "ellipse")!;
                    attr(v, { id: b.id, rx: b.radius, ry: b.radius });
                    v.classList.add(b.viewType)
                    svg.appendChild(v)
                    return v;
                }
                const v = document.getElementById(b.id) || createBodyView();
                attr(v, { cx: b.pos.x, cy: b.pos.y });
            },
            updateRectangularBodyView = (b: RectangularBody) => {
                function createBodyView() {
                    const v = document.createElementNS(svg.namespaceURI, "rect")!;
                    attr(v, { id: b.id, width: b.width, height: b.height });
                    v.classList.add(b.viewType)
                    svg.appendChild(v)
                    return v;
                }
                const v = document.getElementById(b.id) || createBodyView();
                attr(v, { x: b.pos.x, y: b.pos.y });
            };

        //update player ship
        attr(ship, { transform: `translate(${s.ship.pos.x},${s.ship.pos.y})`, class: s.ship.viewType });

        //update bullets
        s.bullets.forEach(updateCircularBodyView);

        //update aliens
        s.aliens.forEach(updateCircularBodyView);

        //update shields
        s.shields.forEach(updateRectangularBodyView);

        //update destroyed parts of shields
        s.shieldDestruction.forEach(updateCircularBodyView);

        //remove destroyed elements
        s.exit.map(o => document.getElementById(o.id))
            .filter(isNotNullOrUndefined)
            .forEach(v => {
                try {
                    svg.removeChild(v)
                } catch (e) {
                    // rarely it can happen that a bullet can be in exit 
                    // for both expiring and colliding in the same tick,
                    // which will cause this exception
                    console.log("Already removed: " + v.id)
                }
            })
        
        //updates score and level display
        scoreDisplay.textContent = `Score: ${s.score}`;
        levelDisplay.textContent = `Level: ${s.level}/${GameConsts.MAX_GAME_LEVEL}`;
        superShipDisplay.textContent = `Super Ship: ${(s.superShip)? 'ACTIVATED' : 'deactivated'}`
        comboDisplay.textContent = `Combo: ${s.comboRecord.length}/${GameConsts.COMBO_FOR_SUPERSHIP}`

        //end game if game is over, display victory or defeat splash, enable restart button
        if (s.gameOver) {
            subscription.unsubscribe();
            const v = document.createElementNS(svg.namespaceURI, "text")!;
            attr(v, { x: GameConsts.CANVAS_SIZE / 6, y: GameConsts.CANVAS_SIZE / 2, class: (s.victory) ? "victory" : "gameover" });
            v.textContent = (s.victory) ? "YOU WIN!!!" + String.fromCodePoint(0x1F44D) : "GAME OVER";
            svg.appendChild(v);
            const restartBtn: HTMLButtonElement = document.getElementById("gameRestartBtn") as HTMLButtonElement;
            restartBtn.style.opacity = "100";
            restartBtn.disabled = false;
        }
    }

    //merge streams and start execution
    const subscription = merge(
        gameClock,
        startLeftMove, startRightMove,
        stopLeftMove, stopRightMove,
        shoot, alienShoot
    ).pipe(
        scan(reduceState, initialState)
    ).subscribe(
        updateView
    )
}

/**
 * immutable RNG class, Dervied from code shown in workshop
 */
class RNG {
    readonly m = 0x80000000
    readonly a = 110354134
    readonly c = 3242342
    constructor(readonly state: number) { }
    int() {
        return (this.a * this.state + this.c) % this.m;
    }
    float() {
        return this.int() / (this.m - 1)
    }
    next() {
        return new RNG(this.int())
    }
}

/**
 * Simple Vector class taken from asteroid example 
 */
class Vec {
    constructor(public readonly x: number = 0, public readonly y: number = 0) { }
    add = (b: Vec) => new Vec(this.x + b.x, this.y + b.y)
    sub = (b: Vec) => this.add(b.scale(-1))
    len = () => Math.sqrt(this.x * this.x + this.y * this.y)
    scale = (s: number) => new Vec(this.x * s, this.y * s)
    setLength = (s: number) => new Vec((this.x / this.len()) * s, (this.y / this.len()) * s)
    ortho = () => new Vec(this.y, -this.x)
    rotate = (deg: number) =>
        (rad => (
            (cos, sin, { x, y }) => new Vec(x * cos - y * sin, x * sin + y * cos)
        )(Math.cos(rad), Math.sin(rad), this)
        )(Math.PI * deg / 180)

    static unitVecInDirection = (deg: number) => new Vec(0, -1).rotate(deg)
    static Zero = new Vec();
}

// runs astroid function on window load.
if (typeof window != 'undefined')
    window.onload = () => {
        spaceinvaders();
    }

/**
 * apply f to every element of a and return the result in a flat array
 * @param a an array
 * @param f a function that produces an array
 */
function flatMap<T, U>(
    a: ReadonlyArray<T>,
    f: (a: T) => ReadonlyArray<U>
): ReadonlyArray<U> {
    return Array.prototype.concat(...a.map(f));
}

const
    /**
     * Composable not: invert boolean result of given function
     * @param f a function returning boolean
     * @param x the value that will be tested with f
     */
    not = <T>(f: (x: T) => boolean) => (x: T) => !f(x), // taken from asteroid sample code
    /**
     * is e an element of a using the eq function to test equality?
     * @param eq equality test function for two Ts
     * @param a an array that will be searched
     * @param e an element to search a for
     */
    elem =
        <T>(eq: (_: T) => (_: T) => boolean) => // taken from asteroid sample code
            (a: ReadonlyArray<T>) =>
                (e: T) => a.findIndex(eq(e)) >= 0,
    /**
     * array a except anything in b
     * @param eq equality test function for two Ts
     * @param a array to be filtered
     * @param b array of elements to be filtered out of a
     */
    except =
        <T>(eq: (_: T) => (_: T) => boolean) => // taken from asteroid sample code
            (a: ReadonlyArray<T>) =>
                (b: ReadonlyArray<T>) => a.filter(not(elem(eq)(b))),
    /**
     * set a number of attributes on an Element at once
     * @param e the Element
     * @param o a property bag
     */
    // taken from asteroid sample code
    attr = (e: Element, o: Object) => { for (const k in o) e.setAttribute(k, String(o[k])) }, // This implicit any error is from the given sample code

    /**
     * Checks if a number is between minimum and maximum, inclusive
     */
    between = (x: number, min: number, max: number): boolean => x >= min && x <= max

/**
 * Type guard for use in filters
 * @param input something that might be null or undefined
 */
function isNotNullOrUndefined<T extends Object>(input: null | undefined | T): input is T {
    return input != null; // taken from asteroid sample code
}

/**
 * Clamps number to min and maximum value
 * @param minVal minimum value
 * @param x number to be clamped
 * @param maxVal maximum value
 * @returns clamped value
 */
const clamp = (minVal: number, x: number, maxVal: number): number => {
    return Math.max(minVal, Math.min(x, maxVal))
}
/**
 * Clamps Vector to minimum and maximum boundry
 * @param vector vector to be clamped
 * @param maxVector maximum boundry box
 * @param minVector minimum boundry
 * @returns clamped vector
 */
const clampVec = (vector: Vec, maxVector: Vec, minVector: Vec = new Vec(0, 0)): Vec => {
    return new Vec(clamp(minVector.x, vector.x, maxVector.x), clamp(minVector.y, vector.y, maxVector.y))
}
