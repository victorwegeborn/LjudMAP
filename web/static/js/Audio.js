///////////////
// Web audio //
///////////////
if (!window.AudioContext) alert('you browser doesnt support Web Audio API')


/* audio globals */
var AUDIO_LOADED = false;




class Audio extends AudioContext {

    constructor(o) {
        super();

        /* audio path to load */
        this._audio = o.audio;

        /* track audio loading state */
        this._audio_loaded = [];

        for (var i = 0; i < this._audio.files.length; i++) {
            this._audio_loaded.push(false)
        }

        /* holds plots */
        this._plot = o.plot;

        this._sequence = o.sequence;

        // load audio on object creation
        this._audio_buffer;
        this._playing = false;

        /* default starting positions of highlight indexes */
        this._sequential_playback_index = -1;
        this._sequence_index = 0;

        /* WAACLock related variables */
        this._clock = null;
        this._event = null;
        this._start_time = 0;

        this._source = null;

        /* audio settings */
        this._fade = data.meta.settings.segmentation.size/2;
        this._launch_interval = data.meta.settings.segmentation.size/2;

        /* hoover playback trackers */
        this._stack = []
        this._stack_limit = 400;
        this._stack_source = null;
        this._stack_volume = null;
        this._stack_clock = new WAAClock(this, {
            toleranceEarly: 0.1
        })
        this._stack_clock.start();
        this._stack_event = this._initialize_stack_event();



        /* holds all reset functions */
        this._resets = {}


    }

    /*  Play.
        Instantiates source nodes and calls plot and sequence map for coloring.

        @param T - List of objects with start (inclusive) and end (exclusive) times.
                   Passed times must be in ms

                    T = [{start: ...., end: ....}, ...., {start: ...., end: ....}]

        @param callback - checks and fires callback function after all sequences
                          have been played
    */
    PLAY(T, callback) {
        // extract and remove first time
        if (!this._playing) {
            var t = T.shift();
            const length = T.length | 0;
            const song_id = t.song_id;
            const start = t.start / 1000;
            const duration = t.duration / 1000;
            const index = t.index;
            this._source = this._instantiate_source(this._instantiate_volume(), song_id);
            this._playing = true;


            // setup UI events
            this._initialize_events(index)

            // fire up source
            this._source.start(0, start, duration);
            this._source.onended = (function(e) {
                if (length > 0) {
                    // play the next segment by calling Play recursivly
                    this._playing = false;
                    this.PLAY(T, callback)

                } else {
                    this._playing = false;
                    this._resetAll()

                    if (this._event) {
                        this._event.clear()
                        this._event = null;
                    }

                    this._sequential_playback_index = -1;

                    if (typeof callback === 'function') {
                        callback()
                    }
                }
            }).bind(this)
        }
    }

    STOP() {
        if (this._source) {
            this._source.stop()
        }
    }

    PAUSE() {
        // TODO
    }

    _initialize_events(index) {
        // fire up clock
        this._start_clock()
        // assign first index which will propagate through
        // the applications various parts
        this._sequential_playback_index = index;

        // set markers at begining of segment
        this._sequence.setSequencePlayheadAt(this._sequential_playback_index)
        this._plot.setHighlight(this._sequential_playback_index)

        var step = data.meta.settings.segmentation.step/1000;

        // set up event for plot and sequence map
        this._event = this._clock.callbackAtTime((e) => {
            this._sequential_playback_index++;
            this._sequence.setSequencePlayheadAt(this._sequential_playback_index)
            this._plot.setHighlight(this._sequential_playback_index)
        }, step + this.currentTime)
        .repeat(step)
        .tolerance({late: 100})
    }

    _instantiate_volume() {
        var volume = this.createGain();
        volume.connect(this.destination)
        return volume
    }

    _instantiate_volume_fade(t) {
        var volume = this.createGain();
        volume.connect(this.destination);
        /* TODO: FIX THESE PARAMETERS */
        volume.gain.exponentialRampToValueAtTime(1.0, this.currentTime + this._fade/1000);
        volume.gain.setValueAtTime(1.0, this.currentTime +  (t-this._fade)/1000);
        volume.gain.exponentialRampToValueAtTime(0.01, this.currentTime + t/1000);
        return volume
    }

    _instantiate_source(volume, song_id) {
        var source = this.createBufferSource();
        source.buffer = this._audio_buffer[song_id];
        source.connect(volume)
        return source
    }

    _start_clock() {
        if (this._clock) {
            this._clock.stop()
        }
        this._clock = new WAAClock(this, {
            toleranceEarly: 0.1
        })
        this._clock.start()
    }

    _get_next_segment_index(index, step_time) {
        var t = this.currentTime - this._start_time
        //console.log(Math.floor(t / step_time))
        return Math.floor(t / step_time)
    }

    _resetAll() {
        this._sequence.resetSequencePlayhead()
        this._plot.resetHighlight()
    }


    isPlaying() {
        return this._playing;
    }


    load() {
        var audioList = this._audio.files;
        var buffer;
        var bufferLoader = new BufferLoader(
            this,
            this._audio.path,
            audioList,
            finishedLoading
        );
        bufferLoader.load();

        function finishedLoading(bufferList) {
            this._audio_buffer = bufferList;
            AUDIO_LOADED = true;
            //$("#loading-sm").hide()
            console.log("Audio loaded.");
        }

        bufferLoader.onload = finishedLoading.bind(this)
    }


    hooverPlay(index, start, duration, song_id) {
        if (AUDIO_LOADED && this._stack.length < this._stack_limit) {
            this._stack.push({
                index: index,
                start: start,
                duration: duration,
                song_id: song_id
            })
        }
    }

    resetHooverPlayStack() {
        this._stack = []
        this._resetAll()
    }


    _stack_playback() {
        if (this._stack.length > 0) {
            var o = this._stack.pop();
            var source = this._instantiate_source(this._instantiate_volume_fade(o.duration), o.song_id)
            source.start(0, o.start, o.duration)
            this._sequence.setSequencePlayheadAt(o.index)
            this._plot.setHighlight(o.index)
        }
    }


    _initialize_stack_event() {
        // return event object for repeated launching from stack
        return this._stack_clock.callbackAtTime(() => {
            this._stack_playback()
        }, this.currentTime)
        .repeat(this._launch_interval/1000)
        .tolerance({late: 100})
    }

    set launchInterval(val) {
        this._launch_interval = val;
        this._stack_event.repeat(this._launch_interval/1000)
    }

    get launchInterval() {
        return this._launch_interval;
    }

    set fade(val) {
        this._fade = val;
    }

    get fade() {
        return this._fade;
    }

}
