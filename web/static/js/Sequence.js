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
var SEGMENT_SIZE = data.meta.segment_size;
var LINE_SEGMENT = Math.floor(data.meta.step_size * 0.05)
var SEGMENT_ALPHA = 0.6;
var LINE_ALPHA = 0.8;
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

const N_PX = data.data[data.data.length-1].start + data.meta.segment_size;
const MIN_xSCALE = seq_width/N_PX;
const MAX_xSCALE = seq_width/(30*data.meta.step_size);
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
    showToolTip(null, 0, '#tooltip')
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


function drawWaveform() {
    var line = new PIXI.Graphics();
    line.lineStyle(1, getSegmentColor('black'), 1);
    var zero = 0.5 * seq_height + 1
    var length = data.meta.waveform.data.length;
    var scale = Math.abs(data.meta.waveform.max - data.meta.waveform.min) / seq_height
    for (var i = 0; i < length; i++) {
        var val = data.meta.waveform.data[i] / scale;
        if (val === 0) {
            line.moveTo(i, zero)
            line.lineTo(i+1, zero)
        } else {
            line.moveTo(i, Math.ceil(zero - val))
            line.lineTo(i, Math.ceil(zero + val))
        }
    }

    line.alpha = 0.9
    // scale to fit
    line.scale.x = N_PX / length;
    seq_container.addChild(line)
}


function initSequence() {

    // segment height
    var height = seq_height + 2;

    // default data segment textures
    seq_textures.data_segment = _constructTexture(data.meta.segment_size, height);
    seq_textures.line = _constructTexture(LINE_SEGMENT, height)


    // render sprite per data point
    for (var i = 0; i < data.data.length; i++) {
        // draw default segment
        _constructSprite(seq_textures.data_segment, seq_segments, {
            start: data.data[i].start,
            color: getSegmentColor(data.data[i].category)
        })

        // draw default segment line
        _constructSprite(seq_textures.line, seq_lines, {
            start: data.data[i].start,
            color: getSegmentColor(data.data[i].category),
            alpha: LINE_ALPHA
        })


        _interactiveDefaultPlayheadSegment({
            index: i,
            start: data.data[i].start,
            width: data.meta.segment_size,
            texture: seq_textures.data_segment,
        })
    }

    // scale to canvas
    seq_container.scale.x = MIN_xSCALE;
    seq_container.updateTransform()

    // draw playhead at start
    initPlayhead()
    // Needs to be optimized
    drawWaveform()
}


function initPlayhead() {
    var head = new PIXI.Graphics(true);
    head.beginFill(SEQ_PLAYHEAD_COLOR);
    head.lineAlignment = 0;
    head.drawRect(0, 0, data.meta.step_size, 2*seq_height)
    head.endFill();
    head.alpha = 0.6;
    seq_playhead.addChild(new PIXI.Sprite.from(seq_app.renderer.generateTexture(head)));
}


function _interactiveDefaultPlayheadSegment(o) {
    var seg = new PIXI.Sprite.from(o.texture)
    var i = o.index
    seg.alpha = 0;
    seg.x = o.start;
    seg.included = false;

    seg.interactive = true;
    seg.hitArea = new PIXI.Rectangle(0, 0, o.width, seq_height + 2)
    seg.mouseover = function(e) {

        showToolTip({start: o.start}, i, '#tooltip')

        if(space_down) {
            data.data[i].category = PLOT.getCategory();
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
                var start = e.target.x;
                console.log(msToTime(start))
                AUDIO.PLAY([{
                    start: start,
                    duration: data.meta.segment_size,
                    step: data.meta.step_size
                }])
            }
        }
    }
    seg.mouseup = function(e) {
        if (seq_is_highlighting && shift_down) {
            // add last segment
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

        var start = N_PX + 1, end = -1;
        $.each(seq_segmentHighlights, function() {
            this.alpha = 0.2;
            this.tint = SEQ_PLAYHEAD_COLOR
            start = Math.min(start, this.x)
            end = Math.max(end, this.x)
        })


        AUDIO.PLAY([{
            start: start,
            duration: end - start + data.meta.segment_size,
            step: data.meta.step_size
        }], resetSequenceHighlighting)
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
    sprite.alpha = settings.alpha || SEGMENT_ALPHA;
    sprite.position.x = settings.start;
    container.addChild(sprite)
}


function _updateSegment(container, o, i) {
    var segment = container.getChildAt(i)
    segment.tint = getSegmentColor(o[i].category)
}


function colorSegmentByIndex(index) {
    _updateSegment(seq_segments, data.data, index)
}



function setSequencePlayheadAt(i) {
    seq_playhead.position.x = i * data.meta.step_size
}

function resetSequencePlayhead() {
    seq_playhead.position.x = 0;
}

function getSegmentColor(c) {
    switch (c) {
        case 'black' : return '0x333a3f'; break;
        case 'blue'  : return '0x007dff'; break;
        case 'green' : return '0x00a754'; break;
        case 'yellow': return '0xffbf42'; break;
        case 'red'   : return '0xe42f46'; break;
        case 'purple': return '0x86007b'; break;
        case 'orange': return '0xffa338'; break;
        case 'teal'  : return '0x008180'; break;
        case 'brown' : return '0xab262c'; break;
            default:
                console.log('Point without valid category');
                return '0x000000';
    }
}
