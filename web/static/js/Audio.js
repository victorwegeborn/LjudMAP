///////////////
// Web audio //
///////////////
if (!window.AudioContext) alert('you browser doesnt support Web Audio API')


/* audio globals */
var AUDIO_LOADED = false;




class Audio extends AudioContext {

    constructor(o) {
        super({
            sampleRate: 44100
        });



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
        this._segments_per_second = 2;// * 1000 / data.meta.settings.segmentation.size;
        this._envelope = 0.1;

        /* hoover playback trackers */
        this._stack = []
        this._stack_limit = 400;
        this._stack_volume = null;
        this._stack_clock = new WAAClock(this, {
            toleranceEarly: 0.1
        })
        this._stack_clock.start();
        this._stack_event = this._initialize_stack_event();

        this._stack_playing_sources = []


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
        if (true) {
            var t = T.shift();
            const length = T.length | 0;
            const song_id = t.song_id;
            const start = t.start;
            const duration = t.duration;
            const index = t.index;
            this._source = this._instantiate_source(this._instantiate_volume(), song_id);
            //this._playing = true;


            // setup UI events
            this._initialize_events(index, duration)

            // fire up source
            this._source.start(0, start, duration);
            this._source.onended = (function(e) {
                if (length > 0) {
                    // play the next segment by calling Play recursivly
                    //this._playing = false;
                    this.PLAY(T, callback)

                } else {
                    //this._playing = false;
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

    PLAYALL() {
        if (data.data.length <= 1) return;

        var song_list = [];
        var song_id = data.data[0].song_id
        var start_p = null
        for (var i = 0; i < data.data.length; i++) {
            var p = data.data[i];

            if (!start_p) start_p = p;

            if (p.song_id != song_id || i == data.data.length - 1) {
                var prev_p = i == data.data.length - 1 ? data.data[i] : data.data[i-1];
                song_list.push({
                    start: start_p.start,
                    duration: prev_p.start - start_p.start + prev_p.length,
                    song_id: song_id,
                    index: start_p.id
                });
                song_id = p.song_id;
                start_p = p;
            }
        }

        this.PLAY(song_list)
    }


    STOP() {
        if (this._source) {
            this._source.stop()
        }
        if (this._stack_playing_sources.length > 0) {
            for (var i = 0; i < this._stack_playing_sources.length; i++ ) {
                this._stack_playing_sources[i].stop()
            }
            this._stack_playing_sources = []
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



        var first_duration = this._get_start_difference(this._sequential_playback_index)
        console.log(first_duration)

        // set up event for plot and sequence map
        this._event = this._clock.callbackAtTime((e) => {
            this._sequential_playback_index++;
            this._sequence.setSequencePlayheadAt(this._sequential_playback_index)
            this._plot.setHighlight(this._sequential_playback_index)
            // update repeat of this event by length of segment
            this._event.repeat(this._get_start_difference(this._sequential_playback_index))
        }, this._get_start_difference(this._sequential_playback_index) + this.currentTime)
        .tolerance({late: 100})
    }

    _get_start_difference(current_index) {
        var next_index = current_index + 1;
        if (current_index < data.data.length && next_index < data.data.length) {
            return data.data[next_index].position - data.data[current_index].position;
        }
        return data.data[current_index].duration;
    }

    _instantiate_volume() {
        var volume = this.createGain();
        volume.connect(this.destination)
        return volume
    }

    /* TODO: GET THIS TO WORK */
    _instantiate_volume_fade(t) {
        var volume = this.createGain();
        volume.connect(this.destination);
        /* TODO: FIX THESE PARAMETERS */
        volume.gain.setValueAtTime(0.001, this.currentTime);
        volume.gain.exponentialRampToValueAtTime(1.0, this.currentTime + t/2 * this._envelope);
        volume.gain.setValueAtTime(1.0, this.currentTime + t/2);
        volume.gain.exponentialRampToValueAtTime(0.001, this.currentTime +  t - t/2 * this._envelope);
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


    _stack_playback(deadline) {
        if (this._stack.length > 0) {
            //this._playing = true;
            var o = this._stack.pop();
            var source = this._instantiate_source(this._instantiate_volume(), o.song_id)
            //var source = this._instantiate_source(this._instantiate_volume_fade(o.duration), o.song_id)
            source.start(0, o.start, o.duration)
            this._sequence.setSequencePlayheadAt(o.index)
            this._plot.setHighlight(o.index)
            this._stack_playing_sources.push(source)
            /*source.onended = (function() {
                if (this._stack_playing_sources.length <= 1) {
                    this._playing = false;
                }
            }).bind(this)*/
        }
    }


    _initialize_stack_event() {
        // return event object for repeated launching from stack
        return this._stack_clock.callbackAtTime((ev) => {
            this._stack_playback(ev.deadline)
        }, this.currentTime)
        .repeat(data.meta.settings.segmentation.size / (this._segments_per_second * 1000) + this.currentTime)
        .tolerance({late: 100})
    }


    set segmentsPerSecond(n) {
        this._segments_per_second = n;
        this._stack_event = null;
        this._stack_event = this._initialize_stack_event()
    }

    get segmentsPerSecond() {
        return this._segments_per_second;
    }

    set segmentEnvelope(i) {
        this._envelope = i;
    }

    get segmentEnvelope() {
        return this._envelope;
    }
}
