var fileInput = $('#uploadButton');
var submitForm = $('#mainForm');
var fileDisplay = $('#fileDisplay');
var fileCounter = $('#fileCounter');
var sizeCounter = $('#sizeCounter');
var fileMap = new Map();
var counter = 0;
var element_id = 0;
var totalFileSize = 0.0;

var fileType = new RegExp('(.wav|.mp3)$');


fileInput.on('change', function(ev) {
    for (var i = 0; i < fileInput[0].files.length; i++) {
        var file = fileInput[0].files[i];
        // prune other files than accepted
        if (fileType.test(file.name)) {

            // skip files already added
            if (fileMap.has(file.name))
                continue;

            // add to map
            file.id = element_id;
            fileMap.set(file.name, file)
            drawRow(file)

            counter++;
            element_id++;
            totalFileSize += parseInt(file.size, 10)/1000000;
        }
    }
    fileCounter.text(counter + ' files');
    sizeCounter.text('~' + Math.ceil(totalFileSize) + ' MB');

    // activate analysis button
    if (fileMap.size > 0) {
        $("input[id=submitNewAudio]").prop("disabled", false);
    }
});


var drawRow = function(file) {
    var row = $(`
        <tr id=`+file.id+`>
            <td scope="row">` + file.name + ` </td>
            <td class="text-right">` + formatSize(file.size) + `</td>
            <td class="text-right"> <ion-icon name="close" onclick="removeFile('` + file.name + `');"></ion-icon> </td>
        </tr>
    `);
    fileDisplay.append(row)
}


var removeFile = function(name) {
    if (fileMap.has(name)) {
        var file = fileMap.get(name);
        $("#"+file.id).remove();
        counter--;
        totalFileSize -= file.size/1000000;
        fileMap.delete(name)
    }
    fileCounter.text(counter + ' files');
    sizeCounter.text('~' + Math.ceil(totalFileSize) + ' MB');

    if (fileMap.size === 0) {
        $("input[id=submitNewAudio]").prop("disabled", true);
    }
}


// event listining on submit
$(submitForm).on('submit', function(ev) {
    ev.preventDefault();
    var error = false;
    $.each(ev.target, function() {
        if (this.type !== 'submit') {
            // check validity of form
            if (!this.checkValidity()) {
                $(submitForm).addClass('was-validated')
                error = true;
            }
        }
    })

    // if input is correct, pack and send to server
    if (!error) {
        send()
    }
})


var send = function() {
    var formData = new FormData();
    showLoadingGif();
    // pack all files for send
    var i = 0;
    for (let [key, value] of fileMap) {

        /* TEMP: blocking more than one file. Remove later */
        /*
        if (i > 0) {
            alert("Cannot handle more than one file atm... :'(. Passing first in list!")
            break;
        }
        */

        formData.append(i ,value);
        i++;
    };

    formData.set('settings', JSON.stringify({
        segmentation: {
            mode: 'uniform',
            size: $('#size').val(),
            step: $('#step').val()
        },
        cluster: {
            components: $('#components').val(),
            neighbours: $('#neighbours').val(),
            metric: $('#metric').val()
        }
    }));

    formData.set('features', JSON.stringify({
        mfccs: {
            disabled: false,
            coefficients: $('#coefficients').val(),
            delta: false,
            deltadelta: false
        },
        spectrals: {
            disabled: false,
            flux: false,
            fluxcentroid: false,
            centroid: false,
            harmonicity: false,
            flatness: false,
            slope: false
        },
        signals: {
            disabled: false,
            rms: false,
            zcr: false
        }
    }));


    $.ajax({
        url: '/process_audio',
        type: 'POST',
        processData: false,
        contentType: false,
        data: formData,
        success: function(data) {
            window.location.href = data.redirect;
        }
    });

    /*
    // send all inputs to server
    formData.set('segmentation_mode', 'uniform')
    formData.set('segment_size', $('#size').val())
    formData.set('step_size', $('#step').val())
    formData.set('components', $('#components').val())
    formData.set('n_neighbours', $('#neighbours').val())
    formData.set('metric', $('#metric').val())
    formData.set('n_songs', i)

    formData.set('coefficients', $('#coefficients').val())
    formData.set('mfccs-disabled', false)
    formData.set('delta', false)
    formData.set('delta-delta', false)

    // default for other features
    formData.set('spectrals-disabled', true)
    formData.set('signals-disabled', true)

    request.open('POST', '/process_audio')
    request.send(formData);

    showLoadingGif();
    request.onload = function(ev) {
        if (request.status != 200) {
            alert(`Error ${request.status}: ${request.statusText}`);
        } else {
            var response = JSON.parse(request.response)
            window.location.href = response.redirect
        }
    };
    */
}

////// Utils

function showLoadingGif(){
    $("#loading").show()
    $("#content").hide()
}

var formatSize = function(size) {
    if (size >= 1000000) {
        return size/1000000 + ' MB';
    }
    else {
        return size/1000 + ' kB';
    }
}
