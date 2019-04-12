console.log(data.meta)

/* key codes */
const SHIFT = 16;
const SPACE = 32;

/* key globals */
var space_down = false;
var shift_down = false;

/* global objects */
var PLOT = null;
var AUDIO = null;



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


    // Populate meta info
    $('#metaDefault small').each(function() {
        if ($(this).hasClass('fileName')) {
            $(this).text(audioPath.split("/").slice(-1))
        }
        else if ($(this).hasClass('duration')) {
            $(this).text(msToTime(audioDuration))
        }
        else if ($(this).hasClass('segmentSize')) {
            $(this).text(data.meta.segment_size + ' ms')
        }
        else if ($(this).hasClass('segmentStep')) {
            $(this).text(data.meta.step_size + ' ms')
        }
        else if ($(this).hasClass('dataPoints')) {
            $(this).text(data.data.length)
        }
    })


    //////////////////////////// BUTTON EVENTS ////////////////////////////


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
        var color = this.value;
        PLOT.changeCategory(color)
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
    });

    $(document).keyup(function(ev) {
        if (space_down) {
            space_down = false;
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
                c = "black";
            } else if (ev.keyCode == 49) {
                c = "blue";
            } else if (ev.keyCode == 50) {
                c = "green";
            } else if (ev.keyCode == 51) {
                c = "yellow";
            } else if (ev.keyCode == 52) {
                c = "red";
            } else if (ev.keyCode == 53) {
                c = "purple";
            } else if (ev.keyCode == 54) {
                c = "orange";
            } else if (ev.keyCode == 55) {
                c = "teal";
            } else if (ev.keyCode == 56) {
                c = "brown";
            } else {
                return;
            }

            PLOT.changeCategory(c)
        }
    });


    //////////////////////////// RETRAIN ////////////////////////////


    function retrain (arg) {

        $("#loadText").show();


        defaultValidPoints = [["id", "startTime(ms)", "label"]]
        for (let i = 0; i < data.data.length; i++) {
            if (data.data[i].category != 'black') {
                defaultValidPoints.push([data.data[i].start/data.meta.step_size, data.data[i].start, data.data[i].category])
            }
        }

        if (defaultValidPoints.length == 0) {
            alert("Can't retrain, there are no labels")
            $("#loadText").hide();
        }

        __data = {
            "points": JSON.stringify(defaultValidPoints),
            "sessionKey": sessionKey,
            "audioPath": audioPath,
            "segment_size": data.meta.segment_size,
            "step_size": data.meta.step_size,
            "components": JSON.stringify(data.meta.components),
            "n_neighbours": data.meta.n_neighbours,
            "metric": data.meta.metric,
            'n_songs': data.meta.n_songs
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


var timeDisplay = $('#timeDisplay');
var indexDisplay = $('#indexDisplay');
function updateTimeAndIndexDisplay(object, index, target) {
    if (object) {
        timeDisplay.text(msToTime(object.start))
        indexDisplay.text('index: ' + index)
    } else {
        timeDisplay.text(msToTime(0))
        indexDisplay.text('index: 0')
    }
}

/*
function showToolTip(object, index, target) {
    const el = $(target);
    if (object) {
        el.html('index: ' + index + '<br>time: ' + msToTime(object.start));
        el.css('display', 'block')
        el.css('height', '30')
    } else {
        el.css('display', 'none')
    }
}
*/


// Outside document.ready as it is used in html code
function msToTime(ms) {
        // Converts milliseconds to duration, min:sec:ms
        var hours = Math.floor((ms / (60 * 60 * 1000)) % 60).toString();
        var minutes = Math.floor((ms / (60 * 1000)) % 60).toString();
        var seconds = Math.floor((ms / 1000) % 60).toString();
        var milliseconds = (ms % 1000).toString();

        if (hours.length == 1) {
            hours = "0" + hours;
        }
        if (minutes.length == 1) {
            minutes = "0" + minutes;
        }
        if (seconds.length == 1) {
            seconds = "0" + seconds;
        }
        if (milliseconds.length == 1) {
            milliseconds = "00" + milliseconds;
        } else if (milliseconds.length == 2) {
            milliseconds = "0" + milliseconds;
        }
        return hours + ":" + minutes + ":" + seconds + "." + milliseconds;
    }
