//////////////////////////// PIXI RENDERER ////////////////////////////
/*
    Segments:

 i:th  1     2                           n
     _____ _____                       _____
    |     |     |                     |     |
    |_____|_____|   .   .   .   .   . |_____|
    |  |  |  |  |                     |  |  |
    |__|__|__|__|                     |__|__|

    |     |     |                     |     |
px: 0     w     2w                 (n-1)w   nw

    w = segment width

*/



// segment drawing globals
var TEXTURE_WIDTH = 1000; // ms
var SEGMENT_SIZE = data.meta.settings.segmentation.size;
var LINE_SEGMENT = Math.floor(data.meta.settings.segmentation.step * 0.03)
var SEGMENT_ALPHA = 0.8;
var LINE_ALPHA = 0.4;
var SEQUENCE_PLAYING_LOCKED = false;

// initialize sequence map when doc is ready
var sequenceCanvas = $('#pixiSequence')
var seq_width = $('#pixiSequence').width();
var seq_height = $('#pixiSequence').height();

var seq_segments = new PIXI.Container();
seq_segments.interactiveChildren = false;
var seq_lines = new PIXI.Container();
seq_lines.interactiveChildren = false;
var seq_container = new PIXI.Container(); // master container
var seq_highlight = new PIXI.Container();
var seq_playhead = new PIXI.Container();
seq_playhead.interactiveChildren = false;
var seq_waveform = new PIXI.Container();

const N_PX = (data.data[data.data.length-1].id + 1) * data.meta.settings.segmentation.size//data.data[data.data.length-1].start + data.data[data.data.length-1].length;
const MIN_xSCALE = seq_width/N_PX;
const MAX_xSCALE = seq_width/(30*TEXTURE_WIDTH);
const SEQ_HIGHLIGHT_COLOR = '0xffffff';
const SEQ_PLAYHEAD_COLOR = '0xff2800';

PIXI.settings.RESOLUTION = window.devicePixelRatio * 1;
PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;

var seq_textures = {}
var seq_segmentHighlights = []
var seq_is_highlighting = false
const SEQ_HIGHLIGHT_AT = 0.5;
const SEQ_HIGHLIGHT_IDLE = 0.25;
const SEQ_HIGHLIGHT_HOOVER = 0.3;


// initialize pixi renderer
var seq_app = new PIXI.Application({
    width: seq_width,
    height: seq_height,
    view: document.getElementById('pixiSequence'),
    autoResize: true,
    backgroundColor: '0xf8f9fa',
    antialias: true
});

// hookup pixi containers
seq_container.addChild(seq_segments);
seq_container.addChild(seq_lines);
seq_container.addChild(seq_highlight);
seq_container.addChild(seq_playhead);
seq_container.addChild(seq_waveform);
seq_app.stage.addChild(seq_container);



// setup interaction
var _mousePos = null;
$('#pixiSequence').off("mousewheel").on("mousewheel", function (event) {
    _zoom(event.deltaY, event.offsetX)
    // force block on scrolling whole page in UI
    var blockScrolling = this.scrollTop === $('#pixiSequence').get(0).scrollHeight - seq_height + 2 && event.deltaY < 0 || this.scrollTop === 0 && event.deltaY > 0;
    return !blockScrolling;
}).mousedown(function(e) {
    _mousePos = {
        x: e.offsetX,
        y: e.offsetY
    }
}).mouseup(function(e) {
    _mousePos = null
}).mouseleave(function(e) {
    _mousePos = null
    updateTimeAndIndexDisplay(null, 0)
}).mousemove(function(e){
    if (_mousePos && !shift_down) {
        var dx = e.offsetX - _mousePos.x;
        _mousePos.x = e.offsetX
        _translate(dx)
    }
});



function _translate(dx) {
    // get the boundary for the sequence container at last pixel of last segment
    var max_x = -Math.floor(seq_container.width - seq_width);
    if (seq_container.x <= 0 && seq_container.x >= max_x) {
        // update container x position
        seq_container.x += dx * 2;

        // ensure we never cross position x = 0
        if (seq_container.x > 0) seq_container.x = 0;
        if (seq_container.x < max_x) seq_container.x = max_x;

        // render transform
        seq_container.updateTransform();
    }
}


function _zoom(dy, x){
    // get the boundary for the sequence container at last pixel of last segment

    if (seq_container.scale.x >= MIN_xSCALE && seq_container.scale.x <= MAX_xSCALE) {
        var zoom_target = (x - seq_container.position.x) / seq_container.scale.x

        // zooming by input speed
        seq_container.scale.x += dy / seq_width;
        seq_container.scale.x = Math.max(MIN_xSCALE, Math.min(MAX_xSCALE, seq_container.scale.x))

        // zoom on pointer
        seq_container.position.x = -zoom_target * seq_container.scale.x + x

        // make sure sequence map stays inside container on zoom out
        if (seq_container.position.x > 0)
            seq_container.position.x = 0;
        if (seq_container.position.x + seq_container.width < seq_width) {
            seq_container.position.x = - seq_container.width + seq_width;
        }

        // render transform
        seq_container.updateTransform();
    }
};


function drawWaveform(last_idxs) {
    if (data.meta.waveform) {
        var line = new PIXI.Graphics();
        line.lineStyle(1, '0x333a3f', 1);

        var zero = 0.5 * seq_height + 1
        var scale = Math.abs(data.meta.waveform.max - data.meta.waveform.min) / seq_height
        var last_length = 0
        var accu = 0
        for (var j = 0; j < last_idxs.length; j++) {

            var idx = last_idxs[j] + 1
            /*
            console.log(j, last_idxs)
            console.log('length passed in waveform: ' + data.meta.waveform.data[j].length )
            console.log('sample rate: ' + data.meta.waveform.data[j].sample_rate)
            console.log('n windows: ' + idx)
            console.log('window time in s: ' + idx * data.meta.settings.segmentation.step / 1000)
            console.log('total samples of frames: ' + idx * data.meta.settings.segmentation.step / 1000 * data.meta.waveform.data[j].sample_rate)
            console.log('frames / frames per pixel = pixels: ' + (idx * data.meta.settings.segmentation.step / 1000 * data.meta.waveform.data[j].sample_rate) / data.meta.waveform.data[j].samples_per_pixel)
            console.log('Correct length: ' + (idx * data.meta.settings.segmentation.step / 1000 * data.meta.waveform.data[j].sample_rate) / data.meta.waveform.data[j].samples_per_pixel * 2);// * 44100 / data.meta.waveform.data[j].sample_rate)
            console.log(44100 / data.meta.waveform.data[j].sample_rate)
            */
            var n_samples = (idx) * data.meta.settings.segmentation.step / 1000 * data.meta.waveform.data[j].sample_rate
            var length = n_samples / data.meta.waveform.data[j].samples_per_pixel * 2; // * 44100 / data.meta.waveform.data[j].sample_rate;
            accu += length

            for (var i = 0; i < length; i += 2) {
                var positive = data.meta.waveform.data[j].data[i] / scale;
                var negative = data.meta.waveform.data[j].data[i+1] / scale
                if (positive == 0) {
                    line.moveTo(i+last_length, zero);
                    line.lineTo(i+1+last_length, zero);
                } else {
                    line.moveTo(i+last_length, Math.ceil(zero+positive));
                    line.lineTo(i+last_length, Math.ceil(zero-positive));
                }
                if (negative == 0) {
                    line.moveTo(i+1+last_length, zero);
                    line.lineTo(i+last_length, zero);
                } else {
                    line.moveTo(i+1+last_length, Math.ceil(zero+negative));
                    line.lineTo(i+1+last_length, Math.ceil(zero-negative));
                }
            }
            last_length = length;
        }
        delete data.meta.waveform

        line.alpha = 0.9
        // scale to fit
        line.scale.x = N_PX / last_length;
        seq_container.addChild(line)
    }
}

function initSequence() {

    // segment height
    var height = seq_height + 2;

    // default data segment textures
    seq_textures.data_segment = _constructTexture(TEXTURE_WIDTH, height);
    seq_textures.line = _constructTexture(LINE_SEGMENT, height)


    // render sprite per data point
    var last_segments = [];
    var current_song = 0;
    for (var i = 0; i < data.data.length; i++) {

        var x = data.data[i].id * data.meta.settings.segmentation.size;
        var w = data.meta.settings.segmentation.step;

        // get last segment of song id for rendering
        // waveform data correctly
        if (data.data[i].song_id > current_song) {
            current_song++;
            last_segments.push(i-1);
        } else if (i == data.data.length-1) {
            last_segments.push(i);
        }

        _constructSprite(seq_textures.data_segment, seq_segments, {
            x: x,
            width: w,
            color: '0x00000'
        })

        _constructSprite(seq_textures.line, seq_lines, {
            x: x,
            width: TEXTURE_WIDTH,
            color: '0x000000',
            alpha: LINE_ALPHA
        })

        _interactiveDefaultPlayheadSegment({
            index: i,
            x: x,
            start: data.data[i].start,
            width: w,
            texture: seq_textures.data_segment,
            song_id: data.data[i].song_id,
        })
    }

    // scale to canvas
    seq_container.scale.x = MIN_xSCALE;
    seq_container.updateTransform()

    // draw playhead at start
    initPlayhead()
    // Needs to be optimized
    drawWaveform(last_segments)
}


function initPlayhead() {
    var head = new PIXI.Graphics(true);
    head.beginFill(SEQ_PLAYHEAD_COLOR);
    head.lineAlignment = 0;
    head.drawRect(0, 0, data.meta.settings.segmentation.size, 2*seq_height)
    head.endFill();
    head.alpha = 0.6;
    seq_playhead.addChild(new PIXI.Sprite.from(seq_app.renderer.generateTexture(head)));
}


function _interactiveDefaultPlayheadSegment(o) {
    var seg = new PIXI.Sprite.from(o.texture)
    var i = o.index
    seg.alpha = 0;
    seg.scale.x *= o.width / TEXTURE_WIDTH;
    seg.x = o.x;
    seg.included = false;
    seg.song_id = o.song_id;
    seg.relative_start = o.start
    seg.index = o.index


    seg.interactive = true;
    seg.hitArea = new PIXI.Rectangle(0, 0, seg.width*(TEXTURE_WIDTH / o.width), seg.height)
    seg.mouseover = function(e) {

        updateTimeAndIndexDisplay({start: o.start}, i+1)

        if(space_down) {
            var current_category = data.data[i].category;
            var new_category = PLOT.getCategory();
            if (current_category !== new_category) {
                // store new colors in history
                history.add([i, current_category])
                // color data point with new category
                data.data[i].category = new_category
            }
            PLOT.updateColors();
        }

        if (seq_is_highlighting && !this.included) {
            this.alpha = SEQ_HIGHLIGHT_AT
            this.included = true;
            seq_segmentHighlights.push(this)
        }
        else {
            this.alpha = SEQ_HIGHLIGHT_HOOVER;
        }
    }
    seg.mouseout = function(e) {
        if (this.included) {
            this.alpha = SEQ_HIGHLIGHT_IDLE
        } else {
            this.alpha = 0
        }
    }
    seg.mousedown = function(e) {
        if (AUDIO_LOADED) {
            if (shift_down) {
                // play portion on click/mark/release
                seq_is_highlighting = true;
                seq_segmentHighlights.push(this)
                this.included = true;
                this.alpha = SEQ_HIGHLIGHT_AT
            } else {
                // play one segment on click
                AUDIO.PLAY([{
                    start: e.target.relative_start,
                    song_id: e.target.song_id,
                    duration: data.meta.settings.segmentation.size,
                    index: o.index
                }])
            }
        }
    }
    seg.mouseup = function(e) {
        if (seq_is_highlighting && shift_down) {
            // add last segment.
            if (!this.included) {
                this.included = true;
                seq_segmentHighlights.push(this)
            }

            SEQUENCE_PLAYING_LOCKED = true;
            playSequenceHighlights()
        }
    }
    seq_highlight.addChild(seg)
}


function playSequenceHighlights() {
    if (seq_segmentHighlights.length > 0) {
        seq_is_highlighting = false

        // sort segments by position
        seq_segmentHighlights = seq_segmentHighlights.sort(function(a, b) {
            return a.transform.position.x - b.transform.position.x;
        })

        var audio_play_segments = [];
        var current_song_id = null;
        //console.log(seq_segmentHighlights)
        for (var i = 0; i < seq_segmentHighlights.length; i++) {

            var e = seq_segmentHighlights[i];
            // change tint and alpha on all segments
            e.alpha = 0.2;
            e.tint = SEQ_PLAYHEAD_COLOR

            // first element
            if (i==0) {
                current_song_id = e.song_id
                audio_play_segments.push({
                    start: e.relative_start,
                    song_id: e.song_id,
                    index: e.index
                })
            } else if (e.song_id != current_song_id && i < seq_segmentHighlights.length - 2) {
                current_song_id = e.song_id
                var last = audio_play_segments[audio_play_segments.length-1];
                last.duration = e.index * data.meta.settings.segmentation.size - last.start;
                audio_play_segments.push({
                    start: e.relative_start,
                    song_id: e.song_id,
                    index: e.index
                })
            } else if (i == seq_segmentHighlights.length - 1) {
                var last = audio_play_segments[audio_play_segments.length-1];
                if (current_song_id == e.song_id) {
                    last.duration = e.relative_start - last.start + data.meta.settings.segmentation.size;
                } else {
                    last.duration = e.index * data.meta.settings.segmentation.size - last.start;
                    audio_play_segments.push({
                        start: e.relative_start,
                        song_id: e.song_id,
                        duration: data.meta.settings.segmentation.size,
                        index: e.index
                    })
                }
            }
        }


        AUDIO.PLAY(audio_play_segments, resetSequenceHighlighting)
    }
}


function resetSequenceHighlighting() {
    if (seq_segmentHighlights.length > 0) {
        $.each(seq_segmentHighlights, function() {
            this.alpha = 0;
            this.tint = SEQ_HIGHLIGHT_COLOR
            this.included = false;
        })
        seq_is_highlighting = false;
        seq_segmentHighlights = []
        SEQUENCE_PLAYING_LOCKED = false;
    }
}

function _constructTexture(width, height) {
    var segment = new PIXI.Graphics(true);
    segment.beginFill('0xFFFFFF');
    segment.lineAlignment = 0;
    segment.drawRect(0, 0, width, height)
    segment.endFill();
    return seq_app.renderer.generateTexture(segment)
}


function _constructSprite(texture, container, settings) {
    var sprite = new PIXI.Sprite.from(texture)
    sprite.y = settings.offsetY || 0;
    sprite.tint = settings.color;
    sprite.scale.x *= settings.width / TEXTURE_WIDTH;
    sprite.alpha = settings.alpha || SEGMENT_ALPHA;
    sprite.position.x = settings.x;
    container.addChild(sprite)
}


function _updateSegment(container, o, i) {
    var segment = container.getChildAt(i)
    segment.tint = COLORS.get(o[i].category, 2, o[i].song_id)
}


function colorSegmentByIndex(index) {
    _updateSegment(seq_segments, data.data, index)
}


function setSequencePlayheadAt(i) {
    console.log(i)
    seq_playhead.position.x = i * data.meta.settings.segmentation.step
}

function resetSequencePlayhead() {
    seq_playhead.position.x = 0;
}
