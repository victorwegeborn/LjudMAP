$(document).ready(function() {

    deck.log.enable()
    deck.log.priority = 1

    console.log(data)

    /* used to render different sets of data points */
    var CURRENT_ALGORITHM = 'default';
    var CURRENT_CATEGORY = 'black';
    var HIGHLIGHT = 'HIGHLIGHT';

    var FLATTEN = [1, 1, 1];

    /* local mouse position on plot (Updated with callbacks) */
    var LOCALMOUSE = { x: 0, y: 0 };

    var POINT_RADIUS = 100;


    const INITIAL_VIEW_STATE = {
        fov: 50,
        distance: 20,
        rotationX: 0,
        rotationOrbit: 0,
        zoom: 0.04,
        offset: [0,0,0],
        translationX: 0,
        translationY: 0,
    };

    let CURRENT_VIEW_STATE = INITIAL_VIEW_STATE;
    let VIEW_HAS_CHANGED = false;

    /* Keys */
    const XKEY = 88;

    var SHIFTDOWN = false;
    var CTRLDOWN = false;
    var XDOWN = false;
    var cDown = false;

    var map = $('#map');
    var width = map.width();
    var height = map.height();


    var labeled = false;


    var max = 80;

    // create scale objects
    var xScale = d3.scaleLinear()
        .domain([-max, max])
        .range([-width/2, width/2]);
    var yScale = d3.scaleLinear()
        .domain([-max, max])
        .range([height/2, -height/2]);

    var new_xScale = xScale;
    var new_yScale = yScale;


    var dataPoints = [];



    function getColor(color) {
        if (color === 'black') return [51,58,63];
        else if (color === "blue") return [0,125,255];
        else if (color === "green") return [0, 167, 84];
        else if (color === "yellow") return [255, 191, 66];
        else if (color === "red") return [228, 47, 70];
        else if (color === "purple") return [134,0,123];
        else if (color === "orange") return [255, 163, 56];
        else if (color === "teal") return [0, 129, 128];
        else if (color === "brown") return [171, 38, 44];
        else if (color === HIGHLIGHT) return [255, 255, 255];
    }


    /* Setup data for display in deck.gl */
    for (let i = 0; i < data.length; i++) {
        dataPoints.push({
            category: CURRENT_CATEGORY,
            id: 'p' + data[i].id,
            start: data[i].start,
            normal: [0,0,0],
            'tsne': data[i].tsne,
            'umap': data[i].umap,
            'som': data[i].som,
            'pca': data[i].pca,
        });
    };



    /* DECK GL RENDERER */
    const deckgl = new deck.DeckGL({
        container: 'map',
        mapbox: false,
        fp64: true,
        views: [
            new deck.OrbitView({ controller: true })
        ],
        viewState: INITIAL_VIEW_STATE,
        onViewStateChange: ({viewState}) => {
            console.log(viewState)
            VIEW_HAS_CHANGED = true;
            CURRENT_VIEW_STATE = viewState;
            deckgl.setProps({viewState: CURRENT_VIEW_STATE});
        },
        layers: [
            new deck.PointCloudLayer({
                id: 'pointCloud',
                data: dataPoints,
                coordinateSystem: COORDINATE_SYSTEM.IDENTITY,
                getPosition: d => [0,0,0],
                getColor: d => getColor(d.category),
                getNormal: d => d.normal,
                radiusPixels: 100,
                lightSettings: {},
                transitions: {
                    getPosition: {
                        duration: 1600,
                        easing: d3.easeExpOut,
                    }
                },
            })
        ],
        pickingRadius: 30,
        getCursor: () => 'crosshair',
        onLoad: () => {
            changeAlgorithm('tsne')
            redrawCanvas(dataPoints)
            initializeSequenceMap(dataPoints)
        }
    })



    /* Orients camera to look at plane
            -1 = origin
             0 = x axis flatten
             1 = y axis flatten
             2 = z axis flatten
    */
    function focusCamera(axis) {
        if (!VIEW_HAS_CHANGED) return;


        // XY plane
        var rotX = 0;
        var rotOrb = 0;

        // x flattened
        if (axis != -1) {
            if (axis == 0) {
                rotX = 90;
                rotOrb = -90;
            }
            else if (axis == 1) {
                rotX = 90;
            }
            else if (axis == 2) {
            }
        }

        currentViewState = Object.assign({}, CURRENT_VIEW_STATE, {
            translationX: 0,
            translationY: 0,
            lookAt: [0,0,0,1], // why the fourth component? Paning stops working without...
            distance: 20,
            rotationX: rotX,
            rotationOrbit: rotOrb,
            transitionDuration: 2000,
            transitionEasing: d3.easeExpOut,
            transitionInterpolator: new deck.LinearInterpolator(['translationX',
                                                                 'translationY',
                                                                 'distance',
                                                                 'rotationX',
                                                                 'rotationOrbit',
                                                                 'lookAt'])
        });
        console.log(currentViewState)
        deckgl.setProps({viewState: currentViewState})
    }


    var colorTrigger = 0;

    /* Canvas layer creation */
    function redrawCanvas(data) {
        // reset color trigger
        if (colorTrigger > Number.MAX_SAFE_INTEGER - 1) { colorTrigger = 0; }
        const pointCloudLayer = new deck.PointCloudLayer({
            id: 'pointCloud',
            data: data,
            coordinateSystem: COORDINATE_SYSTEM.IDENTITY,
            getPosition: d => {
                let _pos = d[CURRENT_ALGORITHM];

                /* handle flattning of axis */
                return [_pos[0]*FLATTEN[0], _pos[1]*FLATTEN[1], _pos[2]*FLATTEN[2]];
            },
            getColor: d => getColor(d.category),
            getNormal: d => d.normal,
            radiusPixels: POINT_RADIUS,
            lightSettings: {},
            updateTriggers: {
                getColor: colorTrigger,
                getPosition: [CURRENT_ALGORITHM, FLATTEN[0], FLATTEN[1], FLATTEN[2]]
            },
            transitions: {
                getPosition: {
                    duration: 1600,
                    easing: d3.easeExpOut,
                }
            },
            pickable: true,
            onHover: info => { LOCALMOUSE.x = info.x, LOCALMOUSE.y = info.y; }
            //onHover: info => hoverInteraction(info)
        });
        deckgl.setProps({
            layers: [pointCloudLayer]
        });
    }



    function changeAlgorithm(algo) {
        CURRENT_ALGORITHM = algo;
    }


    function categorize() {
        labeled = true;
        pointsInRadius = deckgl.pickMultipleObjects({
            x: LOCALMOUSE.x, y: LOCALMOUSE.y,
            radius: 20,
            depth: 30,
        });
        if (pointsInRadius.length > 0) {
            ids = [];
            for (let i = 0; i < pointsInRadius.length; i++) {
                pointsInRadius[i].object.category = CURRENT_CATEGORY;
                ids.push(pointsInRadius[i].object.id)
            }
            colorTrigger++;
            redrawCanvas(dataPoints)
            colorSequenceRect(ids, CURRENT_CATEGORY)
        }
    }



    function updateAudioList() {
        if (audioLoaded) {
            pointsInRadius = deckgl.pickMultipleObjects({
                x: LOCALMOUSE.x, y: LOCALMOUSE.y,
                radius: 20,
                depth: 30,
            });
            if (pointsInRadius.length > 0) {
                startList = [];
                for (let i = 0; i < pointsInRadius.length; i++) {
                    startList.push(pointsInRadius[i].object.start);
                }
                currentSegmentStartTimes = startList;
            }
        }
    }


    //////////////////
    // Sequence Map //
    //////////////////

    var seqMax = 100;


    var seqDims = {
        width: $('#sequenceMap').width(),
        height: $('#sequenceMap').height(),
        svg_dx: 100,
        svg_dy: 100,
    };


    var xScaleSequence = d3.scaleLinear()
        .domain([0, 100])
        .range([0, seqDims.width+2])

    var zoom = d3.zoom()
        .scaleExtent([1.0, 10])
        .extent([
            [0],
            [seqDims.width+2]
        ])
        .translateExtent([
            [0],
            [seqDims.width+2]
        ])
        .on("zoom", zoomed);


    var seqContainer = d3.select("#sequenceMap")
        .append("svg")
        .attr("width", seqDims.width)
        .attr("height", seqDims.height)
        .append("g")


    var rects = seqContainer.selectAll("div").data(data)

    function initializeSequenceMap (data) {
        rects = rects.enter().append("rect")
            .classed("rectBar", true)
            .attr("x", d => { return xScaleSequence(d.start/audioDuration*100) })
            .attr("y", 0)
            .attr('id', d => { return 'p' + d.id })
            .attr("width", (xScaleSequence(stepSize/audioDuration)*100) - xScaleSequence(0))
            .attr("height", "100%")
            .attr("fill", d => { return d.category; })
            .style('fill-opacity', 0.5)
            .on("mouseenter", function(d){
                var coords = d3.mouse(this)
                $("#timeBarDuration").show()
                $("#timeBarDuration").css({
                    'position': 'absolute',
                    'z-index': '1000',
                    'background-color': "black",
                    'color': "white",
                    'pointer-events': 'none',
                    'left': coords[0]
                    //'left': d.start / audioDuration * 100 + '%'
                });
                $("#timeBarDuration").text(msToTime(d.start));
            })
            .on("mouseleave", function(d){
                $("#timeBarDuration").hide()
            })

        seqContainer.style("pointer-events", "all")
        seqContainer.call(zoom)
        seqContainer.on("dblclick.zoom", null)
    }

    function colorSequenceRect(ids, color) {
        rectsBars = d3.selectAll(".rectBar")
            .filter(d => { return ids.includes('p' + d.id) })
        rectsBars.style('fill', color)
    }

    function zoomed() {
        var xNewScale = d3.event.transform.rescaleX(xScaleSequence)
        rects.attr('x', d => { return xNewScale(d.start/audioDuration*100) })
             .attr("width", xNewScale(stepSize/audioDuration*100) - xNewScale(0))
    }



    ///////////////////
    // Button events //
    ///////////////////

    // Change category buttons
    $("#buttonGroup1 button").on("click", function() {
        if (CURRENT_CATEGORY !== this.value) {
            CURRENT_CATEGORY = this.value;
            console.log('new category', CURRENT_CATEGORY)
        }
    });

    // Change algorithm
    $("#buttonGroup2 button").on("click", function() {
        if (CURRENT_ALGORITHM !== this.value) {
            changeAlgorithm(this.value)
            redrawCanvas(dataPoints);
            console.log('new algorithm', CURRENT_ALGORITHM)
        }
    });


    $("#buttonGroup5 button").on("click", () => {
        retrain(this.value);
    });

    $("#cameraFocus").on("click", () => {
        console.log('refocus')
        focusCamera(-1)
    })

    $("#buttonGroupNav button").on("click", function() {
        const axis = this.value;
        if (FLATTEN[axis] === 1) {
            FLATTEN[axis] = 0;
            $(this).addClass('active');
            focusCamera(axis)
        } else {
            FLATTEN[axis] = 1;
            $(this).removeClass('active');
            focusCamera(-1)
        }
        redrawCanvas(dataPoints);
    });

    $("#buttonGroup6 button").on("click", function() {
        console.log('seq',this.value)
        if(this.value=="stop"){
            var audio = document.getElementById('audioBar');
            audio.pause();
            audio.currentTime = 0;
        }
        else {
            console.log($("#audioBar"));
            $("#audioBar").trigger(this.value);
        }
    });



    //////////////////
    // Mouse events //
    //////////////////


    map.on("mousemove", function(ev) {
        if (SHIFTDOWN) {
            categorize();
        }
        else if (CTRLDOWN) {
            updateAudioList();
        }

    })

    /* Setup point radius slider */
    $("#pointRadiusSlider").val(POINT_RADIUS);

    ////////////////
    // Key events //
    ////////////////

    $(document).keydown(function(ev) {
        if (ev.shiftKey) {
            SHIFTDOWN = true;
        }
        else if (ev.ctrlKey) {
            CTRLDOWN = true;
        }
    });

    $(document).keyup(function(ev) {
        if (SHIFTDOWN) {
            SHIFTDOWN = false;
        }
        else if (CTRLDOWN) {
            CTRLDOWN = false;
            currentSegmentStartTimes = [];
        }
        else if (cDown) {
            cDown = false;
            floatingCircleRadius = prevFloatingCircleRadius;

        } else {
            if (ev.keyCode == 48) {
                CURRENT_CATEGORY = "black";
            } else if (ev.keyCode == 49) {
                CURRENT_CATEGORY = "blue";
            } else if (ev.keyCode == 50) {
                CURRENT_CATEGORY = "green";
            } else if (ev.keyCode == 51) {
                CURRENT_CATEGORY = "yellow";
            } else if (ev.keyCode == 52) {
                CURRENT_CATEGORY = "red";
            } else if (ev.keyCode == 53) {
                CURRENT_CATEGORY = "purple";
            } else if (ev.keyCode == 54) {
                CURRENT_CATEGORY = "orange";
            } else if (ev.keyCode == 55) {
                CURRENT_CATEGORY = "teal";
            } else if (ev.keyCode == 56) {
                CURRENT_CATEGORY = "brown";
            }
            else if (ev.keyCode == 81) {
                floatingCircleRadius = 50;
                prevFloatingCircleRadius = 50;
                // var circle = map.selectAll("circle");
                // circle.style('stroke-width', floatingCircleRadius);
            }
            else if (ev.keyCode == 87) {
                floatingCircleRadius = 100;
                prevFloatingCircleRadius = 100;
                // var circle = map.selectAll("circle");
                // circle.style('stroke-width', floatingCircleRadius);
            }
            else if (ev.keyCode == 69) {
                floatingCircleRadius = 150;
                prevFloatingCircleRadius = 150;
                // var circle = map.selectAll("circle");
                // circle.style('stroke-width', floatingCircleRadius);
            } else if (ev.keyCode == 82) {
                floatingCircleRadius = 300;
                prevFloatingCircleRadius = 300;
                // var circle = map.selectAll("circle");
                // circle.style('stroke-width', floatingCircleRadius);
            }
            console.log('new category', CURRENT_CATEGORY)
        }
    });



    /////////////
    // RETRAIN //
    ////////////


    function retrain (arg) {
        if (!labeled) {
            alert("Can't retrain, there are no labels")
        }
        else {
            $("#loadText").show();

            validPoints = [["id", "startTime(ms)", "label"]]

            if (arg === 'labeled') {
                for (let i = 0; i < dataPoints.length; i++) {
                    if (dataPoints[i].category !== 'black') {
                        validPoints.push([dataPoints[i].start/stepSize, dataPoints[i].start, dataPoints[i].category])
                    }
                }
            } else {
                for (let i = 0; i < dataPoints.length; i++) {
                    if (dataPoints[i].category === 'black') {
                        validPoints.push([dataPoints[i].start/stepSize, dataPoints[i].start, dataPoints[i].category])
                    }
                }
            }

            myData = {
                "validPoints": JSON.stringify(validPoints),
                "sessionKey":sessionKey,
                "audioPath":audioPath,
                "segmentSize": segmentSize,
                "stepSize": stepSize
            }

            $.ajax({
                type: "POST",
                url: "/retrain",
                data: myData,
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
    }

    ///////////////
    // Web audio //
    ///////////////


    var audioCtx = new AudioContext();
    var audioBuffer;
    var audioLoaded = false;
    var currentSegmentStartTimes = [];
    loadAudio(audioPath);


    var launchInterval = segmentSize/2;
    $("#launchSlider").val(launchInterval);
    $("#launchSliderText").text("Launch interval: " + launchInterval);

    var fade = segmentSize/2;
    $("#fadeSlider").val(fade);
    $("#fadeSliderText").text("Fade in/out: " + fade);

    var gradient = 50;
    $("#gradientSlider").val(gradient);
    $("#gradientSliderText").text("Gradient: " + gradient);

    $("#launchSlider").on("mousemove", function() {
        launchInterval = this.value;
        $("#launchSliderText").text("Launch interval: " + launchInterval);
    })

    $("#fadeSlider").on("mousemove", function() {
        fade = this.value;
        $("#fadeSliderText").text("Fade in/out: " + fade);
    })

    $("#gradientSlider").on("mousemove", function() {
        gradient = this.value;
        $("#gradientSliderText").text("Gradient: " + gradient);
    })

    function loadAudio(fileName) {
        audioList = [fileName];
        bufferLoader = new BufferLoader(
            audioCtx,
            audioList,
            finishedLoading
        );
        bufferLoader.load();

        function finishedLoading(bufferList) {
            audioBuffer = bufferList[0];
            audioLoaded = true;
            $("#loading-sm").hide()
            console.log("Audio loaded.");
        }
    }





    // This function is called every 1000ms and samples and plays audio segments from
    // currentSegmentStartTimes according to launch-intervals and fade
    function playSegments(){
        if(currentSegmentStartTimes.length > 0) {
            var i;
            var startTime
            console.log(launchInterval);
            for (i = 0; i < 100; i++) {
                startTime = audioCtx.currentTime + (i*launchInterval)/1000;
                var audioInterval = currentSegmentStartTimes[Math.floor(Math.random()*currentSegmentStartTimes.length)];
                var source = audioCtx.createBufferSource();
                source.buffer = audioBuffer;
                var volume = audioCtx.createGain();
                source.connect(volume);
                volume.connect(audioCtx.destination);

                volume.gain.value = 0.1;
                volume.gain.exponentialRampToValueAtTime(1.0, startTime + fade/1000);
                volume.gain.setValueAtTime(1.0, startTime + (segmentSize-fade)/1000);
                volume.gain.exponentialRampToValueAtTime(0.1, startTime + segmentSize/1000);

                if (i*launchInterval >= 1000) {
                    break;
                }
                source.start(startTime, audioInterval/1000, segmentSize/1000);
                console.log(audioInterval + " starting in: " + startTime);
            }
        }
    }


    setInterval(playSegments, 1000);
    //setInterval(updateTimeBar, 100);


})



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
