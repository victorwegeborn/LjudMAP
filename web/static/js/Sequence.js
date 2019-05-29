



function Sequence(data, meta) {

    const canvas = $('#pixiSequence');
    const canvas_width = $(canvas).width();
    const canvas_height = $(canvas).height();

    // Initialize PIXI renderer
    PIXI.settings.RESOLUTION = window.devicePixelRatio * 1;
    PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;
    const app = new PIXI.Application({
        width: canvas_width,
        height: canvas_height,
        view: document.getElementById('pixiSequence'),
        autoResize: true,
        backgroundColor: '0xf8f9fa',
        antialias: true
    });

    /* CONSTANTS */
    const TEXTURE_WIDTH = 1000;
    const TEXTURE_HEIGHT = canvas_height + 2;
    const LINE_TEXTURE_WIDTH = Math.floor(meta.settings.segmentation.step * 0.03) || 1;
    const N_PIXELS = (meta.settings.segmentation.windows[meta.settings.segmentation.windows.length-1]) * meta.settings.segmentation.step
    const MIN_xSCALE = canvas_width / N_PIXELS;
    const MAX_xSCALE = canvas_width / (30 * TEXTURE_WIDTH);


    // setup sprite managing containers
    const containers = {
        segments: new PIXI.Container(),
        lines: new PIXI.Container(),
        waveform: new PIXI.Container(),
        highlight: new PIXI.Container(),
        master: new PIXI.Container()
    }

    containers.segments.interactiveChildren = false;
    containers.lines.interactiveChildren = false;

    $.each(containers, function(key, val) {
        if (key != 'master') {
            containers.master.addChild(val);
        }
        else {
            app.stage.addChild(val);
        }
    })

    /* graphic related variables */
    const alphas = {
        segment: 0.8,
        line: 0.4,
        playhead: 0.95,
        highlight_null: 0,
        highlight: 0.5,
        highlight_idle: 0.25,
        highlight_hover: 0.3,
        highlight_playback: 0.2
    }

    const colors = {
        highlight: '0xffffff',
        playhead: '0xff2800',
        waveform: '0x333a3f'
    }

    /* Texture object creation */
    function Textures() {
        var s = new PIXI.Graphics(true);
        s.beginFill('0xFFFFFF');
        s.lineAlignment = 0;
        s.drawRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
        s.endFill();

        var l = new PIXI.Graphics(true);
        l.beginFill('0xFFFFFF');
        l.lineAlignment = 0;
        l.drawRect(0, 0, LINE_TEXTURE_WIDTH, TEXTURE_HEIGHT);
        l.endFill();

        // generate textures from graphic objects
        this.segment = app.renderer.generateTexture(s);
        this.line = app.renderer.generateTexture(l);
    }

    // create textures from function above
    const textures = new Textures();

    /* Locks */
    var SEQUENCE_PLAYING_LOCK = false;
    var IS_HIGHLIGHTING = false;
    var HIGHLIGHT_PLAYING_LOCK = false;

    /* highlighting variables */
    var highlight_segments = [];
    var HIGH_IDX = null;
    var LOW_IDX = null;

    var playhead_point = null;

    /*-------------------- Initialize --------------------*/

    var last_segments = [];
    var current_song = 0;
    for (var i = 0; i < data.length; i++) {



        var point = data[i];

        if (point.song_id > current_song) {
            current_song++;
            last_segments.push(i-1);
        }
        if (i == data.length-1) {
            last_segments.push(i);
        }

        // construct sprite for colored segment
        constructSprite(containers.segments, {
            texture: textures.segment,
            color: COLORS.get(point.category, 2, point.song_id),
            length: point.length,
            alpha: alphas.segment,
            position: point.position
        });

        // construct sprite for segemnt line
        constructSprite(containers.lines, {
            texture: textures.line,
            alpha: alphas.line,
            position: point.position
        });

        constructInteractiveSegment({
            texture: textures.segment,
            position: point.position,
            length: point.length,
            id: point.id
        })
    }

    function constructSprite(container, o) {
        var s = new PIXI.Sprite.from(o.texture)
        s.tint = o.color;
        s.scale.x *= o.length || 1;
        s.alpha = o.alpha || SEGMENT_ALPHA;
        s.position.x = o.position * TEXTURE_WIDTH;
        container.addChild(s)
    }

    function constructInteractiveSegment(o) {
        var s = new PIXI.Sprite.from(o.texture);
        s.position.x = o.position * TEXTURE_WIDTH;
        s.tint = colors.highlight;
        s.alpha = 0;
        s.scale.x *= o.length;
        s.interactive = true;
        s.hitArea = new PIXI.Rectangle(0, 0, TEXTURE_WIDTH, canvas_height)
        s.id = o.id;

        // used for tracking highlighting multiple segments
        s.included = false

        // hookup events
        s.mouseover = highlight_mouseover
        s.mouseout  = highlight_mouseout
        s.mousedown = highlight_mousedown
        s.mouseup   = highlight_mouseup

        // add to container
        containers.highlight.addChild(s)
    }

    function drawWaveform() {
        if (meta.waveform) {
            var line = new PIXI.Graphics();
            line.lineStyle(1, colors.waveform, 1);
            var zero = canvas_height / 2;
            var scale = Math.abs(meta.waveform.max - meta.waveform.min) / canvas_height;
            var last_length = 0
            var accu = 0
            for (var j = 0; j < meta.settings.segmentation.windows.length; j++) {
                var n_points = meta.settings.segmentation.windows[j]
                var n_samples = n_points * meta.settings.segmentation.step / 1000 * meta.waveform.data[j].sample_rate
                var length = n_samples / meta.waveform.data[j].samples_per_pixel * 2;
                accu += length

                zero_begin_idx = null;
                for (var i = 0; i < length; i += 2) {
                    var negative = Math.floor(meta.waveform.data[j].data[i] / scale);
                    var positive = Math.floor(meta.waveform.data[j].data[i+1] / scale);
                    if (positive > 1) {
                        line.moveTo(i+last_length, Math.ceil(zero+positive));
                        line.lineTo(i+last_length, Math.ceil(zero-positive));
                    }
                    if (negative < -1) {
                        line.moveTo(i+1+last_length, Math.ceil(zero+negative));
                        line.lineTo(i+1+last_length, Math.ceil(zero-negative));
                    }
                }
                last_length = length;
                // draw one long line along zero from start to finish
                line.moveTo(0, zero);
                line.lineTo(last_length+1, zero)
            }
            delete meta.waveform

            line.alpha = 1
            // scale to fit
            line.scale.x = N_PIXELS / last_length;
            containers.waveform.addChild(line)
        }
    }


    containers.master.scale.x = MIN_xSCALE;
    containers.master.updateTransform();
    drawWaveform()

    /*---------------- Highligh Interaction ----------------*/

    function highlight_mouseover(e) {
        var point = data[this.id];

        updateTimeAndIndexDisplay({start: point.start * TEXTURE_WIDTH}, point.id+1)

        // coloring from user
        if (space_down) {
            var current_category = point.category;
            var new_category = PLOT.getCategory();
            if (current_category != new_category) {
                history.add([i, current_category])
                point.category = new_category;
            }
            PLOT.updateColors();
        }

        if (IS_HIGHLIGHTING && !this.included) {
            this.alpha = alphas.highlight;
            this.included = true;
            highlight_segments.push(this);
        }
        else {
            this.alpha = alphas.highlight_hover;
        }
    }

    function highlight_mousedown(e) {
        if (AUDIO_LOADED && !HIGHLIGHT_PLAYING_LOCK) {
            if (shift_down) {
                // playing multiple segments
                // by hightlighting
                IS_HIGHLIGHTING = true;
                highlight_segments.push(this);
                this.included = true;
                this.alpha = alphas.highlight;
            } else {
                // play single point
                var point = data[this.id];
                AUDIO.PLAY([{
                    start: point.start,
                    song_id: point.song_id,
                    duration: point.length,
                    index: point.id
                }])
            }
        }
    }

    function highlight_mouseup(e) {
        if (IS_HIGHLIGHTING && shift_down) {
            // add last segment
            if (!this.included) {
                this.included = true;
                highlight_segments.push(this)
            }

            SEQUENCE_PLAYING_LOCK = true
            playSequenceHighlights()
        }
    }

    function highlight_mouseout(e) {
        if (this.included) {
            this.alpha = alphas.highlight_idle;
        } else {
            this.alpha = 0;
        }
    }


    function playSequenceHighlights() {
        if (highlight_segments.length > 1) {
            IS_HIGHLIGHTING = false
            HIGHLIGHT_PLAYING_LOCK = true;

            // sort segments by position
            low_index = data.length + 1;
            high_index = -1;
            for (var i = 0; i < highlight_segments.length; i++) {
                current_id = highlight_segments[i].id;
                low_index = Math.min(low_index, current_id);
                high_index = Math.max(high_index, current_id);
            }

            // copy indexes for reset
            HIGH_IDX = high_index;
            LOW_IDX = low_index;

            var audio_play_segments = [];
            var current_song_id = null;
            //console.log(highlight_segments)
            for (var i = low_index; i <= high_index; i++) {
                var point = data[i];
                var e = containers.highlight.getChildAt(i);
                // change tint and alpha on all segments
                e.alpha = alphas.highlight_playback;
                e.tint = colors.playhead;
                e.included = true;

                // first element
                if (i==low_index) {
                    current_song_id = point.song_id
                    audio_play_segments.push({
                        start: point.start,
                        song_id: point.song_id,
                        index: point.id
                    })
                } else if (point.song_id != current_song_id && i < high_index) {
                    current_song_id = point.song_id
                    var prev_point = data[i-1];
                    var last = audio_play_segments[audio_play_segments.length-1];

                    last.duration = (prev_point.start + prev_point.length) - last.start;
                    audio_play_segments.push({
                        start: point.start,
                        song_id: point.song_id,
                        index: point.id
                    })
                } else if (i == high_index) {
                    var prev_point = data[i-1];
                    var last = audio_play_segments[audio_play_segments.length-1];
                    if (current_song_id == point.song_id) {
                        last.duration = (point.start + point.length) - last.start;
                    } else {
                        last.duration = (prev_point.start + prev_point.length) - last.start;
                        audio_play_segments.push({
                            start: point.start,
                            song_id: point.song_id,
                            index: point.id,
                            duration: point.length
                        })
                    }
                }
            }
            AUDIO.PLAY(audio_play_segments, resetSequenceHighlighting)
        } else {
            resetSequenceHighlighting()
        }
    }

    function resetSequenceHighlighting() {

        if (LOW_IDX && HIGH_IDX) {
            for (var i = LOW_IDX; i <= HIGH_IDX; i++) {
                var seg = containers.highlight.getChildAt(i);
                seg.alpha = alphas.highlight_null;
                seg.tint = colors.highlight;
                seg.included = false;
            }
            LOW_IDX = null;
            HIGH_IDX = null;
            IS_HIGHLIGHTING = false;
            highlight_segments = []
            SEQUENCE_PLAYING_LOCK = false;
            HIGHLIGHT_PLAYING_LOCK = false;
        }
    }

    /*-------------------- Interaction --------------------*/

    var mouse_position = null;

    // get mouse position over sequence map
    canvas.mousedown(function(e) {
        mouse_position = { x: e.offsetX, y: e.offsetY };
    })

    canvas.mouseup(function(e) {
        mouse_position = null;
    })

    canvas.mouseleave(function(e) {
        mouse_position = null;
        updateTimeAndIndexDisplay(null, 0);
    })

    canvas.off('mousewheel').on('mousewheel', function(e) {
        zoom(e.deltaY, e.offsetX)
        // force block on scrolling whole page in UI
        var blockScrolling = this.scrollTop === $(canvas).get(0).scrollHeight - canvas_height + 2 && e.deltaY < 0 || this.scrollTop === 0 && e.deltaY > 0;
        return !blockScrolling;
    });

    canvas.mousemove(function(e) {
        if (mouse_position && !shift_down) {
            var dx = e.offsetX - mouse_position.x;
            mouse_position.x = e.offsetX;
            translate(dx)
        }
    })


    function translate(dx) {
        // get the boundary for the sequence container at last pixel of last segment
        var max_x = -Math.floor(containers.master.width - canvas_width);
        if (containers.master.x <= 0 && containers.master.x >= max_x) {
            // update container x position
            containers.master.x += dx * 2;

            // ensure we never cross position x = 0
            if (containers.master.x > 0) containers.master.x = 0;
            if (containers.master.x < max_x) containers.master.x = max_x;

            // render transform
            containers.master.updateTransform();
        }
    }

    function zoom(dy, x){
        if (containers.master.scale.x >= MIN_xSCALE && containers.master.scale.x <= MAX_xSCALE) {
            var zoom_target = (x - containers.master.position.x) / containers.master.scale.x

            // zooming by input speed
            containers.master.scale.x += dy / canvas_width;
            containers.master.scale.x = Math.max(MIN_xSCALE, Math.min(MAX_xSCALE, containers.master.scale.x))

            // zoom on pointer
            containers.master.position.x = -zoom_target * containers.master.scale.x + x

            // make sure sequence map stays inside container on zoom out
            if (containers.master.position.x > 0)
                containers.master.position.x = 0;
            if (containers.master.position.x + containers.master.width < canvas_width) {
                containers.master.position.x = - containers.master.width + canvas_width;
            }

            // render transform
            containers.master.updateTransform();
        }
    };



    /*-------------------- Public function --------------------*/

    this.isSequencePlaying = function() {
        return SEQUENCE_PLAYING_LOCK;
    }


    this.colorSegmentByIndex = function(i) {
        var segment = containers.segments.getChildAt(i);
        var point = data[i];
        if (playhead_point && point.id == playhead_point.id) return;
        segment.tint = COLORS.get(point.category, 2, point.song_id);
    }

    this.setSequencePlayheadAt = function(i) {
        if (playhead_point) {
            var current_segment = containers.segments.getChildAt(playhead_point.id);
            current_segment.tint = COLORS.get(playhead_point.category, 2, playhead_point.song_id);
            current_segment.alpha = alphas.segment
        }

        if (i == -1) {
            playhead_point = null;
            return;
        }

        if (i < data.length) playhead_point = data[i];
        else playhead_point = data[data.length-1];

        var new_segment = containers.segments.getChildAt(playhead_point.id);
        new_segment.tint = colors.playhead;
        new_segment.alpha = alphas.playhead;
    }

    this.resetSequencePlayhead = function() {
        this.setSequencePlayheadAt(-1)
        playhead_point = null;
    }
}
