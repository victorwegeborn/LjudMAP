
function showLoadingScreen() {
    $('body').addClass('bg-dark')
    $('#loadingScreen').show()
    $("#loading").show()
    $("#analysisContent").hide()
}



/////////////////////////////////////////////////////////////////////////////



function BufferLoader(context, path, urlList, callback) {
  this.path = path;
  this.context = context;
  this.urlList = urlList;
  this.onload = callback;
  this.bufferList = new Array();
  this.loadCount = 0;
}

BufferLoader.prototype.loadBuffer = function(url, index) {
  // Load buffer asynchronously
  var request = new XMLHttpRequest();
  request.open("GET", url, true);
  request.responseType = "arraybuffer";

  var loader = this;

  request.onload = function() {
    // Asynchronously decode the audio file data in request.response
    loader.context.decodeAudioData(
      request.response,
      function(buffer) {
        if (!buffer) {
          alert('error decoding file data: ' + url);
          return;
        }
        loader.bufferList[index] = buffer;
        if (++loader.loadCount == loader.urlList.length)
          loader.onload(loader.bufferList);
      },
      function(error) {
        console.error('decodeAudioData error', error);
      }
    );
  }

  request.onerror = function() {
    alert('BufferLoader: XHR error');
  }

  request.send();
}

BufferLoader.prototype.load = function() {
  for (var i = 0; i < this.urlList.length; ++i)
    this.loadBuffer(this.path + this.urlList[i][0], i);
}



/////////////////////////////////////////////////////////////////////////////


/**
 * Converts milliseconds to time format 00:00:00.000
 *
 * @param {int} ms - time in milliseconds
 * @return {string} - string formated time
 */
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



/////////////////////////////////////////////////////////////////////////////


/**
 * Small class to track coloring
 * of points and enable undos.
 */
function History() {
    /* holds coloring history */
    this.history = [];

    /* holds current batch to store */
    this.batch = [];

    /* consumes lots of memory obviously */
    this.max_depth = 10;
}

/**
 * Add tracked points to history.
 *
 * @param {array} point - index and previous category stored as [id, category]
 */
History.prototype.add = function(point) {
    this.batch.push(point)
}

/**
 * Moves batch of points into history list
 * on event up for space bar.
 * Limits stack size.
 */
History.prototype.update = function() {
    if (this.history.length == this.max_depth) {
        this.history.shift();
    }

    if (this.batch.length > 0) {
        this.history.push(this.batch)
        this.batch = [];
    }
}

/**
 * Moves batch of points into history list
 * on event up for space bar.
 * Limits stack size.
 *
 * @param {object} plot - accesses update trigger for deck.gl
 * @param {function} segment - updates colors of segments in sequence map
 */
History.prototype.undo = function(plot, segment) {
    // get latest coloring batch and recolor
    var hist = this.history.pop();
    $.each(hist, function() {
        var i = this[0];
        var c = this[1];
        data.data[i].category = c;
        segment.colorSegmentByIndex(i)
    })
    plot.updateColors();
}




/**
 * Uses colors
 *
 */
function Colors() {

    // used to generate n unique colors
    const n = data.meta.audios.files.length;
    const alpha_default = 240;

    // stores the generated colors for later use
    const unique_colors = [];

    // HSL settings
    const H_delta = Math.trunc(360 / n);

    const L = 0.4;

    /* populate unique history colors */
    for (var i = 0; i < n; i++) {

        var H = i * H_delta / 360;
        const S = i % 2 == 0 ? 0.5 : 0.3;
        var R, G, B;

        if (S == 0) {
            R = G = B = 1;
        } else {
            function hue2rgb(v1, v2, vH) {
                if ( vH < 0 ) vH += 1
                if( vH > 1 ) vH -= 1
                if ( ( 6 * vH ) < 1 ) return ( v1 + ( v2 - v1 ) * 6 * vH )
                if ( ( 2 * vH ) < 1 ) return ( v2 )
                if ( ( 3 * vH ) < 2 ) return ( v1 + ( v2 - v1 ) * ( ( 2 / 3 ) - vH ) * 6 )
                return ( v1 )
            }

            if ( L < 0.5 ) var_2 = L * ( 1 + S )
            else           var_2 = ( L + S ) - ( S * L )

            var_1 = 2 * L - var_2

            R = hue2rgb( var_1, var_2, H + ( 1 / 3 ) )
            G = hue2rgb( var_1, var_2, H )
            B = hue2rgb( var_1, var_2, H - ( 1 / 3 ) )
        }

        rgb = [Math.trunc(R * 255), Math.trunc(G * 255), Math.trunc(B * 255), alpha_default];

        function toHex(c) {
            var hex = c.toString(16);
            return hex.length == 1 ? '0' + hex : hex;
        }

        unique_colors.push([i, rgb, '0x' + toHex(rgb[0]) + toHex(rgb[1]) + toHex(rgb[2])])
    }

    // all various colors for labels
    const label_colors = [
        ['black',  [  51,  58,  63, alpha_default], '0x333a3f'],
        ['blue' ,  [   0, 125, 255, alpha_default], '0x007dff'],
        ['green',  [   0, 167,  84, alpha_default], '0x00a754'],
        ['yellow', [ 255, 191,  66, alpha_default], '0xffbf42'],
        ['red',    [ 228,  47,  70, alpha_default], '0xe42f46'],
        ['purple', [ 134,   0, 123, alpha_default], '0x86007b'],
        ['orange', [ 255, 163,  56, alpha_default], '0xffa338'],
        ['teal',   [   0, 129, 128, alpha_default], '0x008180'],
        ['brown',  [ 171,  38,  44, alpha_default], '0xab262c']
    ];
    const n_valid_labels = label_colors.length;




    this.get = function(label_id, format, song_id, alpha=null) {
        if (format >= 0 && format <= 2) {
            if (label_id > 0 && label_id < n_valid_labels) {
                if (format == 1) {
                    var a = alpha == null ? alpha_default : alpha;
                    var c = label_colors[label_id][format];
                    c[3] = a;
                    return c;
                }
                return label_colors[label_id][format];
            } else {
                if (format == 1) {
                    var a = alpha == null ? alpha_default : alpha;
                    var c = unique_colors[song_id][format];
                    c[3] = a;
                    return c;
                }
                return unique_colors[song_id][format];
            }
        }
    }

}
