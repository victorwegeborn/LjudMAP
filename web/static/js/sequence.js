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

var seq_defaultOnly = true;

// segment drawing globals
var SEGMENT_SIZE = data.meta.segment_size;
var LINE_SEGMENT = Math.floor(data.meta.step_size * 0.1)
var SEGMENT_ALPHA = 0.6;
var SUB_PER_DEFAULT_SEGMENT;
var LINE_ALPHA = 0.8;
var SUB_PER_SEG;

// initialize sequence map when doc is ready
var sequenceCanvas = $('pixiSequence')
var seq_width = $('#pixiSequence').width();
var seq_height = $('#pixiSequence').height();

var seq_defaultRects = new PIXI.Container();
var seq_subRects = new PIXI.Container();
var seq_lines = new PIXI.Container();
var seq_container = new PIXI.Container(); // master container
var seq_highlight = new PIXI.Container();
var seq_playhead = new PIXI.Container();

const MIN_xSCALE = seq_width/(data.data[data.data.length-1].start/data.meta.step_size*data.meta.step_size + data.meta.segment_size);
const MAX_xSCALE = seq_width/(70*data.meta.step_size);
const SEQ_HIGHLIGHT_COLOR = '0xffffff';
const SEQ_PLAYHEAD_COLOR = '0xff2800';

PIXI.settings.RESOLUTION = window.devicePixelRatio * 1;
PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;

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
seq_container.addChild(seq_defaultRects);
if (subData !== false) {
    seq_defaultOnly = false;
    seq_container.addChild(seq_subRects);
    SUB_PER_DEFAULT_SEGMENT = data.meta.segment_size / subData.meta.segment_size;
}
seq_container.addChild(seq_lines);
seq_container.addChild(seq_highlight);
seq_container.addChild(seq_playhead);
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
    if (_mousePos) {
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


function initSequence() {

    var h = seq_defaultOnly ? seq_height + 2 : 0.5 * seq_height + 2;

    for (var i = 0; i < data.data.length; i++) {
        _constructSegment(seq_defaultRects, {
            size: data.meta.segment_size,
            start: data.data[i].start,
            color: getSegmentColor(data.data[i].category),
            alpha: SEGMENT_ALPHA,
            offsetY: 0,
            height: h
        });
        _constructSegment(seq_lines, {
            size: Math.floor(data.meta.segment_size * 0.1),
            start: data.data[i].start,
            color: getSegmentColor('black'),
            alpha: LINE_ALPHA,
            offsetY: 0,
            height: h
        });


        if (!seq_defaultOnly) {
            for (var j = i*SUB_PER_DEFAULT_SEGMENT; j < i*SUB_PER_DEFAULT_SEGMENT + SUB_PER_DEFAULT_SEGMENT; j++) {

                //console.log(i, j, subData.data.length, data.data[i].start ,'->', subData.data[j].start)

                // first sub-segment
                _constructSegment(seq_subRects, {
                    size: subData.meta.segment_size,
                    start: subData.data[j].start,
                    color: getSegmentColor(subData.data[j].category),
                    alpha: SEGMENT_ALPHA,
                    offsetY: h,
                    height: h
                });


                // second sub-segment line
                _constructSegment(seq_lines, {
                    size: LINE_SEGMENT,
                    start: subData.data[j].start,
                    color: getSegmentColor('black'),
                    alpha: LINE_ALPHA,
                    offsetY: h,
                    height: h
                });
            }
        }

        _interactivePlayheadSegment(i, data.data[i].start)
    }

    // scale to canvas
    seq_container.scale.x = MIN_xSCALE;
    seq_container.updateTransform()

    // draw playhead at start
    initPlayhead()
}

function initPlayhead() {
    var head = new PIXI.Graphics(true);
    head.beginFill(SEQ_PLAYHEAD_COLOR);
    head.lineAlignment = 0;
    head.drawRect(0, 0, data.meta.segment_size, 2*seq_height)
    head.endFill();
    head.alpha = 0.6;
    seq_playhead.addChild(head);
}


function _interactivePlayheadSegment(i, start) {
    var seg = new PIXI.Graphics(true);
    seg.beginFill(SEQ_HIGHLIGHT_COLOR);
    seg.lineAlignment = 0;
    seg.drawRect(0, 0, SEGMENT_SIZE, seq_height + 2)
    seg.endFill();
    seg.alpha = 0;
    seg.x = start;

    seg.interactive = true;
    seg.hitArea = new PIXI.Rectangle(0, 0, SEGMENT_SIZE, seq_height + 2)
    seg.mouseover = function(e) {
        // add canvas highlighting here
        showToolTip({start: start}, i, '#tooltip')
        this.alpha = 0.3;
    }
    seg.mouseout = function(e) {
        this.alpha = 0;
    }

    seq_highlight.addChild(seg)
}



function _constructSegment(container, style) {
    var seg = new PIXI.Graphics(true);
    seg.beginFill(style.color);
    seg.lineAlignment = 0;
    seg.drawRect(0, style.offsetY, style.size, style.height)
    seg.endFill();
    seg.alpha = style.alpha;
    seg.x = style.start;
    container.addChild(seg);
}


function _updateSegment(container, i, isDefault) {
    var segment = container.getChildAt(i)
    var alpha = segment.alpha;
    var w = segment.width
    var h = segment.height;
    var y = isDefault ? 0 : h;
    var c = isDefault ? data.data[i].category : subData.data[i].category
    var s = isDefault ? data.data[i].start : subData.data[i].start;

    segment.clear();

    segment.beginFill(getSegmentColor(c));
    segment.lineAlignment = 0;
    segment.drawRect(0, y, w, h)
    segment.endFill();
    segment.x = s
    segment.alpha = alpha;
}


function colorSegmentByIndex(index, isDefault) {
    if (isDefault) {
        _updateSegment(seq_defaultRects, index, isDefault)

        // make sure to color subsegments if they exist
        if (!seq_defaultOnly) {
            var sub_index = index*SUB_PER_DEFAULT_SEGMENT;
            for (var i = sub_index; i < sub_index + SUB_PER_DEFAULT_SEGMENT; i++) {
                _updateSegment(seq_subRects, i, false)
            }
        }
    } else {
        _updateSegment(seq_subRects, index, false)

        // get default data index
        var i = Math.floor(index / SUB_PER_DEFAULT_SEGMENT)
        _updateSegment(seq_defaultRects, i, isDefault)
    }
}

function setSequencePlayheadAt(i) {
    seq_playhead.position.x = i * data.meta.step_size
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
