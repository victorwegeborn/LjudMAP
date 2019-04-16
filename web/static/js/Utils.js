
function showLoadingScreen() {
    $('body').addClass('bg-dark')
    $('#loadingScreen').show()
    $("#loading").show()
    $("#analysisContent").hide()
}



/////////////////////////////////////////////////////////////////////////////



function BufferLoader(context, urlList, callback) {
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
  this.loadBuffer(this.urlList[i], i);
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
        segment(i)
        data.data[i].category = c;
    })
    plot.updateColors();
}
