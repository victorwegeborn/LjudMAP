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

    PLOT = new Plot({
        id: 'default',
        data: data.data,
        meta: data.meta,
        canvas: 'map',
        tooltip: '#tooltip',
        colorSegment: colorSegmentByIndex,
        history: history,
        dim: '3D' in data.data[0] ? '3D' : '2D'
    });

    /* initialize sequence */
    initSequence()


    AUDIO = new Audio({
        audio_path: audioPath,
        plot: PLOT,
        f: {
            set_sequence: setSequencePlayheadAt,
            reset_sequence: resetSequencePlayhead
        }
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
            $(this).text(audioPath.split("/").slice(-1))
        }
        else if ($(this).hasClass('duration')) {
            $(this).text(msToTime(audioDuration))
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
        else if (t === 'export') {

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
            console.log(t + 'is not hooked up!')
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
            if(this.value=="stop" && AUDIO.isPlaying()){
                AUDIO.STOP()
            }
            else if (this.value=="play" && !AUDIO.isPlaying()) {
                AUDIO.PLAY([{
                    start: 0,
                    duration: audioDuration
                }])
            }
        }
    });


    //////////////////////////// AUDIO SLIDERS ////////////////////////////

    $("#launchSlider").val(AUDIO.launchInterval);
    $("#launchSliderText").text("Launch interval: " + AUDIO.launchInterval);

    $("#fadeSlider").val(AUDIO.fade);
    $("#fadeSliderText").text("Fade in/out: " + AUDIO.fade);


    $("#launchSlider").on("mousemove", function() {
        AUDIO.launchInterval = this.value;
        $("#launchSliderText").text("Launch interval: " + AUDIO.launchInterval);
    })

    $("#fadeSlider").on("mousemove", function() {
        AUDIO.fade = this.value;
        $("#fadeSliderText").text("Fade in/out: " + AUDIO.fade);
    })


    //////////////////////////// SCALE SLIDERS ////////////////////////////


    var scaleSlider = $('#scaleSlider');

    $(scaleSlider).attr({
        'min': min_scale,
        'max': max_scale,
        'step': scale_step
    });

    $(scaleSlider).on('input', function() {
        PLOT.updateScale($(this).val());
    });

    ////////////////////////////////////////////////////////////////////////


    map.on("mousemove", function(ev) {
        if (space_down) {
            PLOT.categorize();
        }
        else if (shift_down && !SEQUENCE_PLAYING_LOCKED) {
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
            history.undo( PLOT, colorSegmentByIndex )
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
            if (!SEQUENCE_PLAYING_LOCKED) {
                resetSequenceHighlighting()
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


    //////////////////////////// RETRAIN ////////////////////////////


    function retrain (arg) {

        $('#content').hide()
        $('#loading').show()

        defaultValidPoints = [["id", "startTime(ms)", "label"]]
        for (let i = 0; i < data.data.length; i++) {
            if (data.data[i].category != 0) {
                defaultValidPoints.push([data.data[i].start/data.meta.settings.segmentation.size, data.data[i].start, data.data[i].category])
            }
        }

        if (defaultValidPoints.length == 0) {
            alert("Can't retrain, there are no labels")
            $('#loading').hide()
            $('#content').show()
        }

        __data = {
            "points": JSON.stringify(defaultValidPoints),
            "sessionKey": sessionKey,
            "audioPath": audioPath,
            "segment_size": data.meta.settings.segmentation.size,
            "step_size": data.meta.settings.segmentation.step,
            "components": JSON.stringify(data.meta.settings.cluster.components),
            "n_neighbours": data.meta.settings.cluster.neighbours,
            "metric": data.meta.settings.cluster.metric,
            //'n_songs': data.meta.n_songs
        }


        $.ajax({
            type: "POST",
            url: "/retrain",
            data: __data,
            dataType: "json",
            success: function(data, textStatus) {
                if (data.redirect) {
                    // data.redirect contains the string URL to redirect to
                    window.location.href = data.redirect;
                }
                else {
                    console.log("Check ajax request, went to else-statement there");
                }
            }
        });

    }
})
