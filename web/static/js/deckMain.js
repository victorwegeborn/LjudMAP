$(document).ready(function() {

    deck.log.enable()
    deck.log.priority = 1

    /* used to render different sets of data points */
    var CURRENT_ALGORITHM = 'default';
    var CURRENT_CATEGORY = 'black';

    /* local mouse position on plot (Updated with callbacks) */
    var LOCALMOUSE = { x: 0, y: 0 };

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


    var max = 100;

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

    function getPosition(alg, point) {
        if (alg === 'tsne') { return [xScale(parseFloat(point.tsneX)), yScale(parseFloat(point.tsneY)), 0]; }
        if (alg === 'som')  { return [xScale(parseFloat(point.somX)),  yScale(parseFloat(point.somY)), 0];  }
        if (alg === 'pca')  { return [xScale(parseFloat(point.pcaX)),  yScale(parseFloat(point.pcaY)), 0];  }
        if (alg === 'umap') { return [xScale(parseFloat(point.umapX)), yScale(parseFloat(point.umapY)), 0]; }
    }

    function getColor(color) {
        if (color === 'black') return [0,0,0];
        else if (color === "blue") return [0,125,255];
        else if (color === "green") return [0, 167, 84];
        else if (color === "yellow") return [255, 191, 66];
        else if (color === "red") return [228, 47, 70];
        else if (color === "purple") return [134,0,123];
        else if (color === "orange") return [255, 163, 56];
        else if (color === "teal") return [0, 129, 128];
        else if (color === "brown") return [171, 38, 44];
    }


    /* Setup data for display in deck.gl */
    for (let i = 0; i < data.length; i++) {
        dataPoints.push({
            position: [0,0,0], // default position
            category: CURRENT_CATEGORY,
            id: 'p' + data[i].id,
            start: data[i].start,
            normal: [0,1,0],
            'tsne': getPosition('tsne', data[i]),
            'umap': getPosition('umap', data[i]),
            'som': getPosition('som', data[i]),
            'pca': getPosition('pca', data[i]),
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
        viewState: {
            fov: 50,
            distance: 20,
            rotationX: 0,
            rotationOrbit: 0,
            zoom: 0.04,
            offset: [0,0,0],
        },
        layers: [
            new deck.PointCloudLayer({
                id: 'pointCloud',
                data: dataPoints,
                coordinateSystem: COORDINATE_SYSTEM.IDENTITY,
                getPosition: d => d.position,
                getColor: d => getColor(d.category),
                radiusPixels: 100,
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




    var colorTrigger = 0;

    /* Canvas layer creation */
    function redrawCanvas(data) {
        // reset color trigger
        if (colorTrigger > Number.MAX_SAFE_INTEGER - 1) { colorTrigger = 0; }
        const pointCloudLayer = new deck.PointCloudLayer({
            id: 'pointCloud',
            data: data,
            coordinateSystem: COORDINATE_SYSTEM.IDENTITY,
            getPosition: d => d.position,
            getColor: d => getColor(d.category),
            getNormal: d => d.n,
            radiusPixels: 100,
            updateTriggers: {
                getColor: colorTrigger,
                getPosition: CURRENT_ALGORITHM,
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
        for (let i = 0; i < dataPoints.length; i++) {
            dataPoints[i].position = dataPoints[i][CURRENT_ALGORITHM];
        }
    }

    function categorize() {
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


    //////////////////
    // Sequence Map //
    //////////////////

    var seqMax = 100;


    var seqDims = {
        width: $('#sequenceMap').width(),
        height: $('#sequenceMap').height(),
    };


    var xScaleSequence = d3.scaleLinear()
        .domain([0, 100])
        .range([0, seqDims.width+2])

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
            .attr("width", (xScaleSequence(stepSize/audioDuration)*100))
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

        //seqContainer.style("pointer-events", "all")
        //seqContainer.call(zoom)
        //seqContainer.on("dblclick.zoom", null)
    }

    function colorSequenceRect(ids, color) {
        rectsBars = d3.selectAll(".rectBar")
            .filter(d => { return ids.includes('p' + d.id) })
        rectsBars.style('fill', color)
    }

    //drawSequenceMap(dataPoints)

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



    // Change algorithm, and therefor coords
    $("#buttonGroup2 button").on("click", function() {
        if (CURRENT_ALGORITHM !== this.value) {
            changeAlgorithm(this.value)
            redrawCanvas(dataPoints);
            console.log('new algorithm', CURRENT_ALGORITHM)
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
        else if (SHIFTDOWN + XDOWN) {
            console.log('shift + xdown')
        }
    })




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
        else if (ev.keyCode == XKEY) {
            XDOWN = true;
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
            var audioLoaded = true;
            $("#loading-sm").hide()
            console.log("Audio loaded.");
        }
    }



    /*

    circles = d3.selectAll(".dot")
                .filter(function(d) {return Math.abs(new_xScale(d.umapX)-x) < floatingCircleRadius/2
                                          & Math.abs(new_yScale(d.umapY)-y) < floatingCircleRadius/2})
        circles.each(function(d, i){
                currentSegmentStartTimes.push(d3.select(this).attr("start"));
            })
        */


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


    // SELECTION BOX
    var selectionBox = $('#selectionBox')
    var x1 = 0, x2 = 0, x3 = 0, x4 = 0;

    function reCalc() { //This will restyle the div
        var x3 = Math.min(x1,x2); //Smaller X
        var x4 = Math.max(x1,x2); //Larger X
        var y3 = Math.min(y1,y2); //Smaller Y
        var y4 = Math.max(y1,y2); //Larger Y
        div.style.left = x3 + 'px';
        div.style.top = y3 + 'px';
        div.style.width = x4 - x3 + 'px';
        div.style.height = y4 - y3 + 'px';
    }

    startSelectionBox = function(e) {
        div.hidden = 0; //Unhide the div
        x1 = e.clientX; //Set the initial X
        y1 = e.clientY; //Set the initial Y
        reCalc();
    };
    moveSelectionBox = function(e) {
        x2 = e.clientX; //Update the current position X
        y2 = e.clientY; //Update the current position Y
        reCalc();
    };
    releaseSelectionBox = function(e) {
        div.hidden = 1; //Hide the div
    };
})



/*
$(document).ready(function() {

    ///////////////////////////////////////////
    // Create plot, draw points and add zoom //
    ///////////////////////////////////////////



    var n = 15; // number of points
    var max = 100; // maximum of x and y

    // Radius of floating circle (cursor), also used in stroke-width of points
    var floatingCircleRadius = 100;
    var prevFloatingCircleRadius = 100; // temporary solution for centroid placement

    // Algorithm used
    var alg = "tsne";

    // Used to allow export
    var labeled = false;

    var SHIFTDOWN = false;
    var CTRLDOWN = false;
    var cDown = false;
    var categoryColor = "black"; // Start color of floating circle

    // Set variable for audio duration
    var currentClosestTime = 0;

    // Set variabel for graphPoints
    var graphPoints = "";

    // Set dict for centroids
    centroids = {};

    // dimensions and margins
    var map = d3.select("#map")
    width = $("#map").width();
    height = $("#map").height();
    var margin = {
        top: (0 * width),
        right: (0 * width),
        bottom: (0 * width),
        left: (0 * width)
    };

    // sequenceMap
    var sequenceMap = d3.select("#sequenceMap")
    var sequenceMapWidth = $("#sequenceMap").width();
    var sequenceMapHeight = $("#sequenceMap").height();

    // sequenceMap
    var graphMap = d3.select("#graphMap")
    var graphMapWidth = $("#graphMap").width();
    var graphMapHeight = $("#graphMap").height();

    // create scale objects
    var xScale = d3.scaleLinear()
        .domain([-max, max])
        .range([0, width]);
    var yScale = d3.scaleLinear()
        .domain([-max, max])
        .range([height, 0]);

    // creat scale object for sequenceMap
    var xScaleSequence = d3.scaleLinear()
        .domain([0, max])
        .range([0, sequenceMapWidth]);

    // Declare these as identical for now, will be changed
    var new_xScale = xScale;
    var new_yScale = yScale;
    var new_xScaleSequence = xScaleSequence;

    // Pan and zoom
    var zoom = d3.zoom()
        .scaleExtent([.1, 20])
        .extent([
            [0, 0],
            [width, height]
        ])
        .on("zoom", zoomed);

    // Pan and zoom
    var zoom2 = d3.zoom()
        .scaleExtent([1.0, 10])
        .extent([
            [0],
            [sequenceMapWidth]
        ])
        .on("zoom", zoomed2);

    // Add rect, container of points
    map.append("rect")
        .attr("width", $("#map").width())
        .attr("height", $("#map").height())
        .style("fill", "none")
        .style("pointer-events", "all")
        .style("stroke-width", 4)
        .style("stroke", "black")
        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
        .classed("plot", true)


    // Append g-element to map
    var points_g = map.append("g")
        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
        .attr("clip-path", "url(#clip)")
        .classed("points_g", true);

    sequenceMap.append("rect")
        .attr("width", sequenceMapWidth)
        .attr("height", $("#sequenceMap").height())
        .style("fill", "none")
        .style("pointer-events", "all")
        .style("stroke-width", 3)
        .style("stroke", "black")

    // Append g-element to sequenceMap
    var rects_g = sequenceMap.append("g")
        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')')
        .attr("clip-path", "url(#clip)")
        .classed("rects_g", true);

    graphMap.append("rect")
        .attr("id", "graphContainer")
        .attr("width", graphMapWidth)
        .attr("height", $("#graphMap").height())
        .style("fill", "none")
        .style("pointer-events", "all")
        .style("stroke-width", 3)
        .style("stroke", "black")

    // Draw points, start random and change to tsne for visualisation
    drawPoints()
    drawRects()
    changeAlgorithm()

    // set design of timeBar
    var timeBar = d3.select("#timeBar")
        .attr('x', function(d) {
            //return xScale(d.tsneX)}
            return xScaleSequence(0)
        }) // x
        .attr('y', "90%")
        .attr('rx', "100")
        .attr('ry', "50")
        .attr('width', 0.005 * sequenceMapWidth)//(xScaleSequence(segmentSize/audioDuration)*100 - xScaleSequence(0))) // radius
        .attr('height', "20%") // radius
        .style('fill', function(d) {
            return "black"
        }) // color of point


    function drawPoints() {
        console.log('This should print');
        // Draws points based on data provided by python
        points = points_g.selectAll("circle").data(data);
        points = points.enter().append("circle")
            .classed("dot", true) // class = .dot
            .classed("plot", true) // class = .plot
            .attr('cx', function(d) {
                return xScale(Math.random()*200-100)
            }) // x
            .attr('cy', function(d) {
                return yScale(Math.random()*200-100)
            }) // y
            .attr('r', 12) // radius
            .attr('id', function(d) {
                return "p" + d.id
            }) // id
            .attr('start', function(d) {
                return d.start
            }) // starttime of point in given audiofile
            .style('fill', function(d) {
                return d.color
            }) // color of point
            .style('fill-opacity', 0.5) // a bit of transparency
            .style('stroke-width', floatingCircleRadius) // width of invisible radius, used to trigger hover
            .style('stroke-opacity', 0) // Hide frame of points

        // Add functionality for map again, they were overridden during drawing of datapoints
        map.style("pointer-events", "all")
        map.call(zoom)
        map.on("dblclick.zoom", null) // turn off double click zoom
    }

    function drawRects() {
        // Draws rects based on data provided by python

        rects = rects_g.selectAll("rect").data(data);
        rects = rects.enter().append("rect")
            .classed("rectBar", true) // class = .plot
            .attr('x', function(d) {
                //return xScale(d.tsneX)}
                return xScaleSequence((d.start/audioDuration)*100)
            }) // x
            .attr("y", "0")
            .attr('width', (xScaleSequence(stepSize/audioDuration)*100 - xScaleSequence(0))) // radius
            .attr('height', "100%") // radius
            .attr('id', function(d) {
                return "rect" + d.id
            }) // id
            .attr('start', function(d) {
                return d.start
            }) // starttime of point in given audiofile
            .style('fill', function(d) {
                return d.color
            }) // color of point
            .style('fill-opacity', 0.5) // a bit of transparency
            .style('cursor', "pointer") // a bit of transparency
            .on("click",function(d){
                var audio = document.getElementById('audioBar');
                audio.currentTime = d.start / 1000;
                audio.play();
            })
            .on("mouseenter", function(d){
                $("#timeBarDuration").show()
                $("#timeBarDuration").css({
                    'position': 'absolute',
                    'z-index': '-1000',
                    'background-color': "black",
                    'color': "white",
                    'left': d.start / audioDuration * 100 + '%'
                });
                $("#timeBarDuration").text(msToTime(d.start));
            })
            .on("mouseleave", function(d){
                $("#timeBarDuration").hide()
            })
            // $("#" + barId).mouseenter(function() {
            //     $("#timeBarDuration").text(msToTime(point.start));
            //     $("#timeBarDuration").css({
            //         'position': 'absolute',
            //         'background-color': "black",
            //         'color': "white",
            //         'left': point.start / audioDuration * 100 + '%',
            //         'bottom': "100%",
            //         'opacity': '1'
            //     });
            //     $("#timeBarDuration").show()
            // });

            // $("#" + barId).mouseleave(function() {
            //     $("#timeBarDuration").hide()
            // });


        // Add functionality for map again, they were overridden during drawing of datapoints
        sequenceMap.style("pointer-events", "all")
        sequenceMap.call(zoom2)
        sequenceMap.on("dblclick.zoom", null) // turn off double click zoom
    }

    function zoomed() {
        // create new scale ojects based on event
        //$("#floatingCircle").hide()
        new_xScale = d3.event.transform.rescaleX(xScale);
        new_yScale = d3.event.transform.rescaleY(yScale);
        points.data(data)
            .attr('cx', function(d) {
                if (alg=="tsne"){return new_xScale(d.tsneX)}
                else if (alg=="pca"){return new_xScale(d.pcaX)}
                else if (alg=="som"){return new_xScale(d.somX)}
                else if (alg=="umap"){return new_xScale(d.umapX)}
            })
            .attr('cy', function(d) {
                if (alg=="tsne"){return new_yScale(d.tsneY)}
                else if (alg=="pca"){return new_yScale(d.pcaY)}
                else if (alg=="som"){return new_yScale(d.somY)}
                else if (alg=="umap"){return new_yScale(d.umapY)}
            });
        d3.selectAll(".centroid").remove()
            // .attr('cx', function(d) {return new_xScale(((d3.select(this).attr("x")/width) * 200)-100)})
            // .attr('cy', function(d) {return new_yScale(((d3.select(this).attr("y")/height) * 200)-100)})
            // .attr('cx', function(d) {return d3.select(this).attr("x")})
            // .attr('cy', function(d) {return d3.select(this).attr("y")})
    }

    function zoomed2() {
        // create new scale ojects based on event
        new_xScaleSequence = d3.event.transform.rescaleX(xScaleSequence);

        rects.data(data)
            .attr('x', function(d) {
                return new_xScaleSequence((d.start/audioDuration)*100)
            })
            .attr('width', function(d) {
                return (new_xScaleSequence((stepSize/audioDuration)*100) - new_xScaleSequence(0))
            })
        timeBar
            .attr('x', function(d) {
                return new_xScaleSequence(((1000*currentClosestTime)/audioDuration)*100)
            })

        // firstBar = d3.select("#rect0")
        //     if(firstBar.attr("x") > 0) {
        //         console.log("too far out")
        //         allBars = d3.selectAll(".rectBar")
        //             .attr('x', function(d) {
        //                 return new_xScaleSequence((d.start/audioDuration)*100) - firstBar.attr("x")
        //             })
        //     }
    }


    //////////////////
    // Mouse events //
    //////////////////

    map.on("mousemove", function(ev) {
        var coords = d3.mouse(this);
        if (SHIFTDOWN) {
            categorize(coords[0], coords[1]);
        }
        else if (CTRLDOWN) {
            updateAudioList(coords[0], coords[1]);
        }
    })

    $(".plot").mousemove(function(ev) {
        //$("#floatingCircle").show();
        drawFloatingCircle(ev);
    });

    $(".plot").mouseenter(function() {
        $('#floatingCircle').css({
            'visibility': '' + 'visible'
        });
    });

    $(".plot").mouseleave(function() {
        $('#floatingCircle').css({
            'visibility': '' + 'hidden'
        });
    });


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
        else if (ev.keyCode == 67 && categoryColor != "black") {
            cDown = true;
            floatingCircleRadius = 65;
            drawFloatingCircle(ev);
        } else {
            if (ev.keyCode == 48) {
                categoryColor = "black";
            } else if (ev.keyCode == 49) {
                categoryColor = "blue";
            } else if (ev.keyCode == 50) {
                categoryColor = "green";
            } else if (ev.keyCode == 51) {
                categoryColor = "yellow";
            } else if (ev.keyCode == 52) {
                categoryColor = "red";
            } else if (ev.keyCode == 53) {
                categoryColor = "purple";
            } else if (ev.keyCode == 54) {
                categoryColor = "orange";
            } else if (ev.keyCode == 55) {
                categoryColor = "teal";
            } else if (ev.keyCode == 56) {
                categoryColor = "brown";
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
            drawFloatingCircle(ev);
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
            drawFloatingCircle(ev);
        }
    });


    ////////////
    // Clicks //
    ////////////

    map.on("click", function() {
        var coords = d3.mouse(this);
        if (cDown) {
            addCentroid(coords[0], coords[1]);
        }
        else {
            categorize(coords[0], coords[1]);
        }
    })

    // Change color of floating circle
    $("#buttonGroup1 button").on("click", function() {
        value = this.value;
        categoryColor = value;
    });

    // Change algorithm, and therefor coords
    $("#buttonGroup2 button").on("click", function() {
        alg = this.value;
        changeAlgorithm();
    });

    $("#buttonGroup3 button").on("click", function() {
        floatingCircleRadius = this.value;
    });

    $("#buttonGroup4 button").on("click", function() {
        arrayToCSV();
    });

    $("#buttonGroup5 button").on("click", function() {
        retrain();
    });

    $("#buttonGroup6 button").on("click", function() {
        if(this.value=="stop"){
            var audio = document.getElementById('audioBar');
            audio.pause();
            audio.currentTime = 0;
        }
        else {
            $("#audioBar").trigger(this.value);
        }

    });

    $("#graphMap").on("click", function() {
        updateGraph();
    })


    /////////////////////
    // Misc. functions //
    /////////////////////


    function categorize(x, y) {
        // Changes color of points and bars
        labeled = true;
        if (alg=="tsne") {
            circles = d3.selectAll(".dot")
                .filter(function(d) {return Math.abs(new_xScale(d.tsneX)-x) < floatingCircleRadius/2
                                          & Math.abs(new_yScale(d.tsneY)-y) < floatingCircleRadius/2})
            circles.style('fill', categoryColor)

            rectsBars = d3.selectAll(".rectBar")
                .filter(function(d) {return Math.abs(new_xScale(d.tsneX)-x) < floatingCircleRadius/2
                                          & Math.abs(new_yScale(d.tsneY)-y) < floatingCircleRadius/2})
            rectsBars.style('fill', categoryColor)
        }
        else if (alg=="pca") {
            circles = d3.selectAll(".dot")
                .filter(function(d) {return Math.abs(new_xScale(d.pcaX)-x) < floatingCircleRadius/2
                                          & Math.abs(new_yScale(d.pcaY)-y) < floatingCircleRadius/2})
            circles.style('fill', categoryColor)

            rectsBars = d3.selectAll(".rectBar")
                .filter(function(d) {return Math.abs(new_xScale(d.pcaX)-x) < floatingCircleRadius/2
                                          & Math.abs(new_yScale(d.pcaY)-y) < floatingCircleRadius/2})
            rectsBars.style('fill', categoryColor)
        }
        else if (alg=="som") {
            circles = d3.selectAll(".dot")
                .filter(function(d) {return Math.abs(new_xScale(d.somX)-x) < floatingCircleRadius/2
                                          & Math.abs(new_yScale(d.somY)-y) < floatingCircleRadius/2})
            circles.style('fill', categoryColor)

            rectsBars = d3.selectAll(".rectBar")
                .filter(function(d) {return Math.abs(new_xScale(d.somX)-x) < floatingCircleRadius/2
                                          & Math.abs(new_yScale(d.somY)-y) < floatingCircleRadius/2})
            rectsBars.style('fill', categoryColor)
        }
        else if (alg=="umap") {
            circles = d3.selectAll(".dot")
                .filter(function(d) {return Math.abs(new_xScale(d.umapX)-x) < floatingCircleRadius/2
                                          & Math.abs(new_yScale(d.umapY)-y) < floatingCircleRadius/2})
            circles.style('fill', categoryColor)

            rectsBars = d3.selectAll(".rectBar")
                .filter(function(d) {return Math.abs(new_xScale(d.umapX)-x) < floatingCircleRadius/2
                                          & Math.abs(new_yScale(d.umapY)-y) < floatingCircleRadius/2})
            rectsBars.style('fill', categoryColor)
        }
    }

    function updateAudioList(x, y) {
        currentSegmentStartTimes = []
        if (alg=="tsne") {
            circles = d3.selectAll(".dot")
                        .filter(function(d) {return Math.abs(new_xScale(d.tsneX)-x) < floatingCircleRadius/2
                                                  & Math.abs(new_yScale(d.tsneY)-y) < floatingCircleRadius/2})
                circles.each(function(d, i){
                        currentSegmentStartTimes.push(d3.select(this).attr("start"));
                    })
        }
        else if (alg=="pca") {
            circles = d3.selectAll(".dot")
                        .filter(function(d) {return Math.abs(new_xScale(d.pcaX)-x) < floatingCircleRadius/2
                                                  & Math.abs(new_yScale(d.pcaY)-y) < floatingCircleRadius/2})
                circles.each(function(d, i){
                        currentSegmentStartTimes.push(d3.select(this).attr("start"));
                    })
        }
        else if (alg=="som") {
            circles = d3.selectAll(".dot")
                        .filter(function(d) {return Math.abs(new_xScale(d.somX)-x) < floatingCircleRadius/2
                                                  & Math.abs(new_yScale(d.somY)-y) < floatingCircleRadius/2})
                circles.each(function(d, i){
                        currentSegmentStartTimes.push(d3.select(this).attr("start"));
                    })
        }
        else if (alg=="umap") {
            circles = d3.selectAll(".dot")
                        .filter(function(d) {return Math.abs(new_xScale(d.umapX)-x) < floatingCircleRadius/2
                                                  & Math.abs(new_yScale(d.umapY)-y) < floatingCircleRadius/2})
                circles.each(function(d, i){
                        currentSegmentStartTimes.push(d3.select(this).attr("start"));
                    })
        }
    }

    function addCentroid(x, y) {
        centroids[categoryColor] = [x, y]
        d3.select("#" + categoryColor + "centroid").remove()
        points_g.append("circle")
            .classed("centroid", true)
            .attr("id", categoryColor + "centroid")
            .attr('x', x) // x
            .attr('y', y) // y
            .attr('cx', function(d) {
                //return new_xScale(((x/width) * 200)-100)
                return x
            }) // x
            .attr('cy', function(d) {
                //return height - new_yScale(((y/height) * 200)-100)
                return y
            }) // y
            .attr('r', 25) // radius
            .style('fill', function(d) {
                return categoryColor
            }) // color of point
            .style('stroke', "white")
            .style('stroke-width', "25")
            .style('stroke-opacity', "0.8")
            .style('fill-opacity', 1.0) // no transparency
            .style('z-index', 1000) // a bit of transparency
        updateGraph(categoryColor, x, y)
    }

    function drawFloatingCircle(ev) {
        // Draws floating circle
        $('#floatingCircle').css({
            'left': '' + ev.pageX - (floatingCircleRadius / 2) + 'px',
            'top': '' + ev.pageY - (floatingCircleRadius / 2) + 'px',
            'width': '' + floatingCircleRadius + 'px',
            'height': '' + floatingCircleRadius + 'px',
            'background-color': categoryColor,
            'background-image': 'radial-gradient(circle, ' + categoryColor + ' ' + (gradient-30) + '%, white 100%)'
        });
    }

    function changeAlgorithm () {
        var circle = map.selectAll(".dot");
        circle.transition()
            .duration(3000)
            .attr('cx', function(d) {
                if (alg=="tsne"){return new_xScale(d.tsneX)}
                else if (alg=="pca"){return new_xScale(d.pcaX)}
                else if (alg=="som"){return new_xScale(d.somX)}
                else if (alg=="umap"){return new_xScale(d.umapX)}
            })
            .attr('cy', function(d) {
                if (alg=="tsne"){return new_yScale(d.tsneY)}
                else if (alg=="pca"){return new_yScale(d.pcaY)}
                else if (alg=="som"){return new_yScale(d.somY)}
                else if (alg=="umap"){return new_yScale(d.umapY)}
            })
    }

    function arrayToCSV () {
        if (!labeled) {
            alert("Can't export, there are no labels")
        }
        else {
            twoDiArray = [["id", "startTime(ms)", "label"]]

            var i = 0;
            $(".dot").each(function(){
                p = d3.select("#" + $(this).attr('id'))
                //while (p.attr('start') < i*stepSize)
                label = $("#"+p.style("fill")+"Label").val()
                if (label === undefined) {label = "none"}
                twoDiArray.push([p.attr('id'), p.attr('start'), label])
            })

            var csvRows = [];
            for (var i = 0; i < twoDiArray.length; ++i) {
                csvRows.push(twoDiArray[i].join(','));
            }

            var csvString = csvRows.join('\r\n');
            var a = document.createElement('a');
            a.href = 'data:attachment/csv,' + csvString;
            a.target = '_blank';
            a.download = 'labels.csv';

            document.body.appendChild(a);
            a.click();
            a.remove();
        }
    }

    function updateGraph (color, centroidX, centroidY) {
        // Loop through points and calculate distances from centroid
        X = [];
        Y = [];
        $(".dot").each(function(){
            p = d3.select("#" + $(this).attr('id'))
            X.push((p.attr('start')/audioDuration)*graphMapWidth)

            dist = Math.sqrt(
                    (centroidX - p.attr('cx'))*(centroidX - p.attr('cx')) +
                    (centroidY - p.attr('cy'))*(centroidY - p.attr('cy')));
            Y.push(dist)
        })

        // Transform distribution to 0-1
        YMax = Math.max.apply(Math, Y)
        for(var i=0; i<Y.length; i++) {
            Y[i] /= YMax;
        }

        // Convert to proper string format
        pointsAsString = ""
        Y = medianFilter(Y, $("#medianfilterValue").val())
        Y[0] = 100
        Y[Y.length-1] = 100
        for (var i2 = 0; i2 < X.length; i2++) {
            pointsAsString += X[i2]
            pointsAsString += "," + Y[i2]*graphMapHeight + " "
        }

        // Remove potential existing line of same color
        d3.select("#polyline" + color).remove()

        // Create line
        graphMap.append("polyline")
            .attr("id", "polyline" + color)
            .attr("stroke", color)
            .attr("stroke-width", 3)
            .attr("fill", color)
            .attr("fill-opacity", 0.5)
            .attr("points", pointsAsString)
    }

    // function updateGraph () {
    //     usedColors = []
    //     $(".dot").each(function(){
    //         p = d3.select("#" + $(this).attr('id'))
    //         if (p.style("fill") != "black" & usedColors.indexOf(p.style("fill")) == -1){
    //             usedColors.push(p.style("fill"))
    //         }
    //     })

    //     d3.selectAll("polyline").remove()
    //     aa = 1
    //     for (var i = 0; i < usedColors.length; i++) {
    //         graphPoints = "";
    //         graphPoints2 = "";
    //         X = [];
    //         Y = [];
    //         $(".dot").each(function(){
    //             p = d3.select("#" + $(this).attr('id'))
    //             X.push((p.attr('start')/audioDuration)*graphMapWidth)

    //             graphPoints2 += ((p.attr('start')/audioDuration)*graphMapWidth).toString()
    //             if (p.style("fill") != usedColors[i]) {
    //                 graphPoints2 += "," + aa * graphMapHeight + " "
    //                 Y.push("1")
    //             }
    //             else {
    //                 graphPoints2 += "," + 0 + " "
    //                 Y.push("0")
    //             }
    //         })
    //         Y = medianFilter(Y, 5)
    //         for (var i2 = 0; i2 < X.length; i2++) {
    //             graphPoints += X[i2]
    //             graphPoints += "," + Y[i2]*graphMapHeight + " "
    //         }

    //         graphMap.append("polyline")
    //             .attr("stroke", usedColors[i])
    //             .attr("stroke-width", 2)
    //             .attr("fill", "none")
    //             .attr("points", graphPoints)

    //         aa = 0.8
    //     }
    // }

    function medianFilter (array, windowSize) {
        newArray = []
        for (var i = 0; i < array.length; i++) {
            currentValues = [array[i]]
            var i2 = 1
            while (i2<=windowSize) {
                currentValues.push(array[i+i2])
                currentValues.push(array[i-i2])
                i2++;
            }
            newArray.push(median(currentValues))
        }
        return newArray
    }

    function median(values){
        values.sort(function(a,b){
            return a-b;
        });

        if(values.length ===0) return 0

        var half = Math.floor(values.length / 2);

        if (values.length % 2) {
            return values[half];
        }
        else {
            return (values[half - 1] + values[half]) / 2.0;
        }

        }

    function retrain () {
        if (!labeled) {
            alert("Can't retrain, there are no labels")
        }
        else {
            $("#loadText").show();
            d3.selectAll("circle")
                .style("display", "none");
            validPoints = [["id", "startTime(ms)", "label"]]

            $(".dot").each(function(i){
                p = d3.select("#" + $(this).attr('id'))
                //label = $("#"+p.style("fill")+"Label").val()
                if (p.style("fill") != 'black') {
                    validPoints.push([p.attr('start')/stepSize, p.attr('start'), p.style("fill")])
                }
            })

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
            var audioLoaded = true;
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

    function updateTimeBar() {
        var audio = document.getElementById('audioBar');
        currentClosestTime = (Math.ceil(audio.currentTime*1000 / 1000) * 1000)/1000;
        timeBar.attr("x", new_xScaleSequence(((1000*(currentClosestTime)-1000)/audioDuration)*100))

        // console.log("adjusting")
        // var adjustment = d3.select("#rect0").attr("x");

        // if(adjustment > 0) {

        //     allBars = d3.selectAll(".rectBar")
        //         .attr('x', function(d) {
        //             return new_xScaleSequence((d.start/audioDuration)*100) - adjustment;
        //         })

        //     d3.select("#timeBar")
        //         .attr('x', function(d) {
        //             return new_xScaleSequence(((1000*currentClosestTime)/audioDuration)*100) - adjustment;
        //         })
        // }
    }

    // Sample audio from points every second
    setInterval(playSegments, 1000);
    setInterval(updateTimeBar, 100);


})

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
