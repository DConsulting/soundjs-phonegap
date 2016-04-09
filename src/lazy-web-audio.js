this.createjs = this.createjs || {};

(function() {
    'use strict';

    /**
     * Deprecated due to memory leaks with WebAudio on iOS in UIWebView. Use WebAudioPlugin instead.
     * Not updated to match latest createjs architecture.
     *
     * @deprecated
     * @constructor
     */
    function LazyWebAudioPlugin() {
        this.AbstractPlugin_constructor();

        // PRIVATE PROPERTIES
        this._volume = 1;

        this._capabilities = s._capabilities;
        this._loaderClass = createjs.LazyWebAudioLoader;
        this._soundInstanceClass = createjs.LazyWebAudioInstance;
    }

    var p = createjs.extend(LazyWebAudioPlugin, createjs.AbstractPlugin);
    var s = LazyWebAudioPlugin;

    /**
     * Resets the AudioContext. Useful when you are using this together with Cordova Media.
     * Cordova Media play or record breaks the current AudioContext.
     *
     * NOTE: Calling reset too much times will break AudioContext creation on iOS
     */
    s.resetContext = function() {
        if (s._context && s._context.close) {
            s._context.close();
        }

        var desiredSampleRate = null;
        var AudioCtor = window.AudioContext || window.webkitAudioContext;

        desiredSampleRate = typeof desiredSampleRate === 'number'
            ? desiredSampleRate
            : 44100;

        var context = new AudioCtor();

        // Check if hack is necessary. Only occurs in iOS6+ devices
        // and only when you first boot the iPhone, or play a audio/video
        // with a different sample rate
        if (/(iPhone|iPad)/i.test(navigator.userAgent) &&
            context.sampleRate !== desiredSampleRate) {
            var buffer = context.createBuffer(1, 1, desiredSampleRate);
            var dummy = context.createBufferSource();
            dummy.buffer = buffer;
            dummy.connect(context.destination);
            dummy.start(0);
            dummy.disconnect();

            context.close(); // dispose old context
            context = new AudioCtor();
        }

        s._context = context;
        createjs.LazyWebAudioLoader.context = s._context;
        createjs.LazyWebAudioInstance.context = s._context;
    };

    /**
     * If true the plugin will clear the playbackResource on _cleanUp call. Useful when you are playing lots of
     * audio files and memory usage is critical.
     * Note that setting this to true will make it possible to read a file more than once.
     * @type {boolean}
     */
    p.forgetBufferOnClean = false;
    p.context = null;

    // STATIC PROPERTIES
    s._capabilities = null;
    s._context = null;

    // STATIC PUBLIC METHODS
    s.isSupported = function() {
        s._generateCapabilities();

        return true;
    };

    s._generateCapabilities = function() {
        if (s._capabilities != null) return;

        if (s._context == null) {
            s.resetContext();
        }

        s._capabilities = {
            panning: false,
            volume: true,
            tracks: -1
        };

        var supportedExtensions = createjs.Sound.SUPPORTED_EXTENSIONS;

        for (var i = 0, len = supportedExtensions.length; i < len; i++) {
            var ext = supportedExtensions[i];
            s._capabilities[ext] = true;
        }

        // 0=no output, 1=mono, 2=stereo, 4=surround, 6=5.1 surround.
        // See http://www.w3.org/TR/webaudio/#AudioChannelSplitter for more details on channels.
        //if (s.context.destination.numberOfChannels < 2) {
        //    s._capabilities.panning = false;
        //}
    };

    // PUBLIC METHODS
    p.toString = function() {
        return '[LazyWebAudioPlugin]';
    };

    p.register = function (loadItem, instances) {
        if (typeof loadItem === 'string') {
            // This is an url but AbstractPlugin_register expects an object with src property.
            loadItem = {src: loadItem};
        }

        var loader = this.AbstractPlugin_register(loadItem, instances);

        return loader;
    };

    p.removeSound = function (src) {
        this.AbstractPlugin_removeSound(src);
    };

    p.create = function (src, startTime, duration) {
        var si = this.AbstractPlugin_create(src, startTime, duration);
        si.setPlaybackResource(null);
        return si;
    };

    // plugin does not support these
    p.setVolume = p.getVolume = p.setMute = null;

    createjs.LazyWebAudioPlugin = createjs.promote(LazyWebAudioPlugin, 'AbstractPlugin');
}) ();

(function() {
    'use strict';

    function LazyWebAudioRequest(loadItem) {
        this._loadItem = loadItem;

        this.AbstractRequest_constructor(loadItem);
    }

    var p = createjs.extend(LazyWebAudioRequest, createjs.AbstractRequest);

    p.load = function () {
        var self = this;
        var evt = new createjs.Event('initialize');
        this.dispatchEvent(evt);

        // Fake load completion. We'll actually load when you start playing the sound.
        setTimeout(function() {
            self.dispatchEvent('complete');
        }, 0);
    };

    p.destroy = function() {
        this.AbstractRequest_destroy();
    };

    createjs.LazyWebAudioRequest = createjs.promote(LazyWebAudioRequest, 'AbstractRequest');
}) ();

(function() {
    'use strict';

    function LazyWebAudioLoader(loadItem) {
        this.AbstractLoader_constructor(loadItem, true, createjs.AbstractLoader.SOUND);
    }

    var p = createjs.extend(LazyWebAudioLoader, createjs.AbstractLoader);
    var s = LazyWebAudioLoader;

    s.context = null;
    s.canLoadItem = function (item) {
        return item.type == createjs.AbstractLoader.SOUND;
    };

    p.toString = function() {
        return '[LazyWebAudioLoader]';
    };

    p._createRequest = function() {
        this._request = new createjs.LazyWebAudioRequest(this._item);
    };

    createjs.LazyWebAudioLoader = createjs.promote(LazyWebAudioLoader, 'AbstractLoader');
}) ();

(function() {
    'use strict';

    /**
     * LazyWebAudioInstance extends the base api of {{#crossLink "AbstractSoundInstance"}}{{/crossLink}} and is used by
     * {{#crossLink "LazyWebAudioPlugin"}}{{/crossLink}}.
     *
     * @param {String} src The path to and file name of the sound.
     * @param {Number} startTime Audio sprite property used to apply an offset, in milliseconds.
     * @param {Number} duration Audio sprite property used to set the time the clip plays for, in milliseconds.
     * @param {Object} playbackResource Any resource needed by plugin to support audio playback.
     * @class WebAudioSoundInstance
     * @extends AbstractSoundInstance
     * @constructor
     */
    function LazyWebAudioInstance(src, startTime, duration, playbackResource) {
        this.AbstractSoundInstance_constructor(src, startTime, duration, playbackResource);

        this._duration = 1; // We just need the duration to be more then startTime. Anything larget then 0 is fine.
    }

    var p = createjs.extend(LazyWebAudioInstance, createjs.AbstractSoundInstance);
    var s = LazyWebAudioInstance;

    s.context = null;

    // PUBLIC METHODS
    p.toString = function() {
        return '[LazyWebAudioInstance]';
    };

    p.setMasterVolume = function(value) {
        this._updateVolume();
    };

    p.setMasterMute = function(isMuted) {
        this._updateVolume();
    };

    // PRIVATE METHODS
    p._removeLooping = function(value) {
        this._loopRequired = false;
    };

    p._addLooping = function(value) {
        this._loopRequired = true;
    };

    p._loadAudioData = function(src, successCallback, errorCallback) {
        var request = new XMLHttpRequest();
        request.open('GET', src, true);
        request.responseType = 'arraybuffer';

        request.onload = function() {
            setTimeout(function() {
                s.context.decodeAudioData(request.response, function(buffer) {
                    setTimeout(function() {
                        successCallback({buffer: buffer, src: src});
                    });
                });
            }, 0);
        };

        request.onerror = function() {
            // We need better handling of the error callback part
            errorCallback({src: src});
        };

        request.send();
    };

    p._createAudioNode = function() {
        var audioNode = s.context.createBufferSource();
        var gainNode = s.context.createGain();
        var self = this;

        audioNode.buffer = this.playbackResource;
        audioNode.onended = function() {
            // Sound complete will call _cleanUp
            if (!audioNode.loop) {
                self._handleSoundComplete(null);
            }
        };

        audioNode.connect(gainNode);
        gainNode.connect(s.context.destination);

        this._audioNode = audioNode;
        this._gainNode = gainNode;

        return audioNode;
    };

    p._beginPlaying = function (playProps) {
        var self = this;

        if (self.playbackResource) {
            return self.AbstractSoundInstance__beginPlaying(playProps);
        } else {
            self._loadAudioData(self.src,
                function onPreloadSuccess(data) {
                    self.playbackResource = data.buffer;

                    self.AbstractSoundInstance__beginPlaying(playProps);
                },
                function onPreloadFail(data) {
                    self.AbstractSoundInstance__beginPlaying(playProps);
                }
            );
        }

        return true;
    };

    p._handleSoundReady = function() {
        this._createAudioNode();
        this._audioNode.loop = (this._loopRequired === true);
        this._audioNode.start(0);

        this._updateVolume();
    };

    p._pause = function () {
        // TODO: Not implemented
    };

    p._resume = function () {
        // TODO: Not implemented
    };

    p._updateVolume = function() {
        var self = this;

        if (this._gainNode && !isNaN(this._volume)) {
            this._gainNode.volume = this._volume;
        }
    };

    p._calculateCurrentPosition = function () {
        return 0;
    };

    p._updatePosition = function () {
        //if (!this._paused) {this._handleSoundReady();}
    };

    p._handleLoop = function () {
        // No need to do anything with the current implementation. We are using WebAudio loop no matter
        // how much loops are required. We can improve this later.
    };

    p._updateDuration = function () {
        this._pause();
        this._resume();
    };

    p._handleStop = function() {
        this._cleanUpAudioNode();
    };

    p._cleanUpAudioNode = function (audioNode) {
        if(audioNode) {
            audioNode.stop(0);
            audioNode.disconnect(0);
            // necessary to prevent leak on iOS Safari 7-9. will throw in almost all other
            // browser implementations.
            try { audioNode.buffer = s._scratchBuffer; } catch(e) {}
            audioNode = null;
        }

        return audioNode;
    };

    p._handleCleanUp = function () {
        this._cleanUpAudioNode(this._audioNode);

        if (p.forgetBufferOnClean) {
            this.playbackResource = null;
        }
    };

    p.destroy = function() {
        this.AbstractSoundInstance_destroy();

        this._gainNode.disconnect(0);
        this._gainNode = null;
    };

    createjs.LazyWebAudioInstance = createjs.promote(LazyWebAudioInstance, "AbstractSoundInstance");

}) ();