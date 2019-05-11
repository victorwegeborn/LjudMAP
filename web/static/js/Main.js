console.log(data.meta)
console.log(data.data)

/* key codes */
const SHIFT = 16;
const SPACE = 32;

/* key globals */
var space_down = false;
var shift_down = false;

/* global objects */
var PLOT = null;
var AUDIO = null;
var SEQUENCE = null;
const COLORS = new Colors;
const history = new History();


$(document).ready(function() {
    $('[data-toggle="tooltip"]').tooltip();

    var map = $('#map');


    /* Scale slider defaults */
    const min_scale = 1;
    const max_scale = 6;
    const scale_step = 0.01;

    var labeled = false;

    //////////////////////////// INITIALIZING ////////////////////////////
    SEQUENCE = new Sequence(
        data.data, data.meta
    );

    PLOT = new Plot({
        id: 'default',
        data: data.data,
        meta: data.meta,
        canvas: 'map',
        tooltip: '#tooltip',
        colorSegment: SEQUENCE.colorSegmentByIndex,
        history: history,
        dim: '3D' in data.data[0] ? '3D' : '2D'
    });


    /* initialize sequence */
    //initSequence()


    AUDIO = new Audio({
        audio: data.meta.audios,
        plot: PLOT,
        sequence: SEQUENCE
    });
    AUDIO.load()

    // enable switch between 2D and 3D clustering
    if ('2D' in data.data[0]) {
        $('#btn-2D').attr('disabled', false)
    } else {
        $('#btn-2D').attr('disabled', true)
    }

    if ('3D' in data.data[0]) {
        $('#btn-3D').attr('disabled', false)
    } else {
        $('#btn-3D').attr('disabled', true)
    }


    // Populate meta info
    $('#metaDefault small').each(function() {
        if ($(this).hasClass('fileName')) {
            //$(this).text(audioPath.split("/").slice(-1))
        }
        else if ($(this).hasClass('duration')) {
            //$(this).text(msToTime(audioDuration))
        }
        else if ($(this).hasClass('segmentSize')) {
            $(this).text(data.meta.settings.segmentation.size + ' ms')
        }
        else if ($(this).hasClass('segmentStep')) {
            $(this).text(data.meta.settings.segmentation.step + ' ms')
        }
        else if ($(this).hasClass('dataPoints')) {
            $(this).text(data.data.length)
        }
    })


    //////////////////////////// BUTTON EVENTS ////////////////////////////

    // special settings for each drop down menu
    if (data.meta.sessions.previous.length == 0) {
        $('#open-recent-dropwdown').addClass('drop-highlight-disabled')
    }

    /* Drop down menu handling */
    var modal = $('#modal');
    var modalContent = $('#modal .modal-content')
    var modalDialog = $('.modal-dialog')
    $('#menuWrapper .dropdown-item').on('click', function(ev) {
        var t = this.dataset.target
        if (t === 'open') {
            modalDialog.removeClass('modal-lg')
            showModal(t)
        }
        else if (t === 'recent') {
            modalDialog.addClass('modal-lg')
            showModal(t)
        }
        else if (t === 'features') {
            modalDialog.addClass('modal-lg')
            showModal(t)
        }
        else if (t === 'recluster') {
            modalDialog.removeClass('modal-lg')
            showModal(t)
        }
        else if (t === 'export') {
            exportDataToCsv();
        }
        else if (t === 'undo') {
            history.undo( PLOT, colorSegmentByIndex )
        }
        else if (t === 'coagulate') {
            modalDialog.removeClass('modal-lg')
            showModal(t)
        }
        else if (t === 'synthesize') {

        }
        else {
            console.log(t + ' is not hooked up!')
        }
    })

    function showModal(target) {
        modalContent.load('/modal/' + target, function(html) {
            modal.modal({show: true})
        })

    }


    // Meta data info text toggle setup
    var metaInfo = $('.metaInfo')
    var metaIsHidden = false;
    $('#toggleMeta').on('click', function() {
        if (metaIsHidden) {
            $(metaInfo).each(function() {
                $(this).prop('hidden', false)
            })
            metaIsHidden = false
        } else {
            $(metaInfo).each(function() {
                $(this).prop('hidden', true)
            })
            metaIsHidden = true
        }
    })


    // Button category selection
    $("#buttonGroup1 button").on("click", function() {
        console.log(this.value)
        PLOT.changeCategory(parseInt(this.value))
    });


    // Change algorithm
    $("#buttonGroup2 button").on("click", function() {
        if (this.value === '2D') {
            PLOT.changeDimensions('2D');
            $('#btn-3D').removeClass('active')
            $('#btn-2D').addClass('active')
        }
        else if(this.value === '3D') {
            PLOT.changeDimensions('3D');
            $('#btn-2D').removeClass('active')
            $('#btn-3D').addClass('active')
        }
    });


    // retrain buttons
    $("#buttonGroup5 button").on("click", function() { retrain(this.value) });

    // re-initialize camera on click
    $(".cameraFocus").on("click", function() {
        PLOT.focusCamera(-1);
    })

    // Axes flattening buttons
    $("#buttonGroupNav button").on("click", function() {
        const axis = this.value;
        if (PLOT.getFlatState(axis) === 1) {
            $(this).addClass('active');
            PLOT.setFlatState(axis, 0)
            PLOT.focusCamera(axis);
        } else {
            $(this).removeClass('active');
            PLOT.setFlatState(axis, 1)
            PLOT.focusCamera(-1);
        }
    });


    // Sequential play, pause (todo), and stop
    $("#buttonGroup6 button").on("click", function() {
        if (AUDIO_LOADED) {
            if(this.value=="stop"){
                //console.log('stopping')
                AUDIO.STOP()
            }
            else if (this.value=="play" && !AUDIO.isPlaying()) {
                AUDIO.PLAYALL()
            }
        }
    });


    //////////////////////////// AUDIO Settings ////////////////////////////

    const grainDensity = $('#grain-density');
    const grainEnvelope = $('#grain-envelope');

    // set UI from audio defaults
    grainDensity.val(AUDIO.segmentsPerSecond)
    grainEnvelope.val(AUDIO.segmentEnvelope)

    grainDensity.on('input', function() {
        var n = parseInt(this.value)
        if (n > 1) {
            AUDIO.segmentsPerSecond = n;
        }
    })

    grainEnvelope.on('input', function() {
        var e = parseInt(this.value);
        if (e >= 0 && e <= 1) {
            AUDIO.segmentEnvelope = e;
        }
    })


    ////////////////////////////////////////////////////////////////////////


    map.on("mousemove", function(ev) {
        if (space_down) {
            PLOT.categorize();
        }
        else if (shift_down && !SEQUENCE.isSequencePlaying()) {
            PLOT.updateAudioList(AUDIO);
        }
    })


    //////////////////////////// KEYBOARD ////////////////////////////

    $(document).keydown(function(ev) {
        if (ev.keyCode == SPACE) {
            space_down = true;
        }
        else if (ev.keyCode == SHIFT) {
            shift_down = true;
        }
        else if ((ev.metaKey || ev.ctrlKey) && ev.keyCode == 90) {
            // undo
            console.log('test')
            console.log(history)
            history.undo( PLOT, SEQUENCE )
            console.log(history)
        }
    });

    $(document).keyup(function(ev) {
        if (space_down) {
            space_down = false;
            // make sure to update history
            history.update()
            console.log(history)
        }
        else if (shift_down) {
            shift_down = false;
            if (!SEQUENCE.isSequencePlaying()) {
                //SEQUENCE.resetSequenceHighlighting()
                AUDIO.resetHooverPlayStack()
            }
        } else {
            var c;
            if (ev.keyCode == 48) {
                c = 0; // black
            } else if (ev.keyCode == 49) {
                c = 1; // blue
            } else if (ev.keyCode == 50) {
                c = 2; //Green
            } else if (ev.keyCode == 51) {
                c = 3; // yellow
            } else if (ev.keyCode == 52) {
                c = 4; // red
            } else if (ev.keyCode == 53) {
                c = 5; // purple
            } else if (ev.keyCode == 54) {
                c = 6; // orange
            } else if (ev.keyCode == 55) {
                c = 7; // teal
            } else if (ev.keyCode == 56) {
                c = 8; // brown
            } else {
                return;
            }

            PLOT.changeCategory(c)
        }
    });


    function exportDataToCsv() {
        $('#csv-form').on('submit', function(ev) {
            var fmt = $("<input type='hidden' name='format' value='csv'/>")
            var dat = $("<input type='hidden' name='data'/>")
            var ado = $("<input type='hidden' name='audios'/>")
            var nme = $("<input type='hidden' name='name' value='" + data.meta.sessions.current[0] +  "''/>")
            dat.val(JSON.stringify(data.data))
            ado.val(JSON.stringify(data.meta.audios))
            $(this).append(fmt)
            $(this).append(dat)
            $(this).append(ado)
            $(this).append(nme)
        })
        $('#csv-form').submit()
        // ugly fix to remove from body
        setTimeout(function() {
            $("#csv-form").empty()
        }, 2000)
    }
})
