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
var SEGMENT_SIZE = 10;
var SEGMENT_ALPHA = 0.9;
var LINE_ALPHA = 0.3;

// initialize sequence map when doc is ready
var sequenceCanvas = $('pixiSequence')
var seq_width = $('#pixiSequence').width();
var seq_height = $('#pixiSequence').height();

var seq_defaultRects = new PIXI.Container();
var seq_subRects = new PIXI.Container();
var seq_lines = new PIXI.Container();
var seq_container = new PIXI.Container(); // master container

const MIN_xSCALE = seq_width/(data.data.length*SEGMENT_SIZE);
const MAX_xSCALE = seq_width/(70*SEGMENT_SIZE);


PIXI.settings.RESOLUTION = window.devicePixelRatio * 1;
PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.NEAREST;

// initialize pixi renderer
var seq_app = new PIXI.Application({
    width: seq_width,
    height: seq_height,
    view: document.getElementById('pixiSequence'),
    autoResize: true,
    transparent: false,
    antialias: false
});

// hookup pixi containers
seq_container.addChild(seq_defaultRects);
if (subData !== false) {
    seq_defaultOnly = false;
    seq_container.addChild(seq_subRects);
}
seq_container.addChild(seq_lines);
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

    if (seq_container.scale.x > MIN_xSCALE && seq_container.x <= 0 && seq_container.x >= max_x) {
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
    var limit_x = -Math.floor(seq_container.width - seq_width);

    if (seq_container.scale.x >= MIN_xSCALE && seq_container.scale.x <= MAX_xSCALE) {


        var zoom_target = (x - seq_container.position.x) / seq_container.scale.x

        // zooming by input speed
        seq_container.scale.x += dy / seq_width;
        seq_container.scale.x = Math.max(MIN_xSCALE, Math.min(MAX_xSCALE, seq_container.scale.x))

        // focus on mouse point
        seq_container.position.x = -zoom_target * seq_container.scale.x + x

        // ensure sequence border
        seq_container.position.x = Math.min(0, Math.max(limit_x, seq_container.position.x))

        // render transform
        seq_container.updateTransform();
    }
};


function initSequence() {
    if (seq_defaultOnly) {
        for (var i = 0; i < data.data.length; i++) {
            _constructSegment(i, SEGMENT_SIZE, 0, SEGMENT_SIZE, seq_height + 2, getSegmentColor(data.data[i].category), SEGMENT_ALPHA, seq_defaultRects)
        }
    } else {
        for (var i = 0; i < data.data.length; i++) {
            var w = SEGMENT_SIZE;
            var h = 0.5 * seq_height + 2;

            // REMOVE THIS LATER
            var c = data.data[i].category;
            if (i === data.data.length - 1) {
                c = 'red';
            }
            _constructSegment(i,     w,   0,   w, h, getSegmentColor(c), SEGMENT_ALPHA,  seq_defaultRects)
            _constructSegment(i,     w,   0,   1, seq_height + 2, 'black', LINE_ALPHA,  seq_lines)
            _constructSegment(i*2,   w/2, h, w/2, h, getSegmentColor(data.data[i].category), SEGMENT_ALPHA, seq_subRects)
            _constructSegment(i*2+1, w/2, h, w/2, h, getSegmentColor(data.data[i].category), SEGMENT_ALPHA, seq_subRects)
            _constructSegment(i*2+1, w/2, h,   1, h, 'black', LINE_ALPHA, seq_lines)
        }
    }
    // scale to canvas
    seq_container.setTransform(0, 0, MIN_xSCALE, 0);
}


function _constructSegment(idx, segmentSize, yOffset, width, height, color, alpha, container) {
    var rectangle = new PIXI.Graphics(true);
    rectangle.beginFill(color);
    rectangle.lineAlignment = 0;
    rectangle.drawRect(0, yOffset, width, height)
    rectangle.endFill();
    rectangle.alpha = alpha;
    rectangle.x = idx*segmentSize;
    container.addChild(rectangle);
}


function _updateSegment(i, container, color, yOffset) {
    var segment = container.getChildAt(i)
    var w = segment.width;
    var h = segment.height;
    var alpha = segment.alpha;

    segment.clear()
    segment.beginFill(color);
    segment.lineAlignment = 0;
    segment.drawRect(0, yOffset, w, h)
    segment.endFill();
    segment.alpha = alpha;
}



function updateDefaultSegmentById(i) {
    _updateSegment(i, seq_defaultRects, getSegmentColor(data.data[i].category), 0)
}


function updateSubSegmentById(i) {
    if (i < subData.data.length - 1)
        _updateSegment(i, seq_subRects, getSegmentColor(subData.data[i].category), seq_height * 0.5 + 2)
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
