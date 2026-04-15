class MockAudioPlayer extends EventTarget {

    static MIN_DURATION = 180;
    static MAX_DURATION = 330;
    static TICK_MS = 250;

    constructor() {
        super();
        this._src         = '';
        this._currentTime = 0;
        this._duration    = 0;
        this._playing     = false;
        this._interval    = null;
    }

    get src()      { return this._src; }
    set src(value) { this._src = value; }

    get currentTime() { return this._currentTime; }
    set currentTime(value) {
        this._currentTime = Math.max(0, Math.min(value, this._duration));
        this.dispatchEvent(new Event('timeupdate'));
    }

    get duration() { return this._duration; }

    get error() { return null; }

    load() {
        this._stopTicker();
        this._currentTime = 0;
        this._duration = MockAudioPlayer.MIN_DURATION +
            Math.floor(Math.random() * (MockAudioPlayer.MAX_DURATION - MockAudioPlayer.MIN_DURATION));

        setTimeout(() => this.dispatchEvent(new Event('loadedmetadata')), 50);
    }

    play() {
        return new Promise((resolve) => {
            this._playing = true;
            this._startTicker();
            resolve();
        });
    }

    pause() {
        this._playing = false;
        this._stopTicker();
    }

    _startTicker() {
        this._stopTicker();
        this._interval = setInterval(() => {
            if (!this._playing) return;

            this._currentTime += MockAudioPlayer.TICK_MS / 1000;
            this.dispatchEvent(new Event('timeupdate'));

            if (this._currentTime >= this._duration) {
                this._currentTime = this._duration;
                this._playing = false;
                this._stopTicker();
                this.dispatchEvent(new Event('ended'));
            }
        }, MockAudioPlayer.TICK_MS);
    }

    _stopTicker() {
        if (this._interval !== null) {
            clearInterval(this._interval);
            this._interval = null;
        }
    }
}
