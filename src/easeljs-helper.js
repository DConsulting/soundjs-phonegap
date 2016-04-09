(function(window) {
	'use strict';

	FlashCanvasManager.Events = {
		DEPENDENCIES_LOADED: 'dependencies_loaded',
		SCRIPT_LOADED: 'script_complete',
		STAGE_CREATED: 'stage_created',
		STAGE_DESTROY: 'stage_destroy',
		STAGE_READY: 'stage_ready', // Dispatched when the stage is ready bu before the root is added as a child.
		ROOT_READY: 'root_ready',
		ROOT_DESTROY: 'root_destroy',
		LOAD_MANIFEST: 'load_manifest',
		DISPOSE: 'dispose'
	};

	function FlashCanvasManager(canvasElement) {
		this.canvas = $(canvasElement);
		this.stage = new createjs.Stage(canvasElement);

		// Contains the original sound objects from the manifest
		this._soundObjects = [];
		this._isDisposed = false;

		createjs.Touch.enable(this.stage);

		this.root = null;
		this.rootName = null;
		this.images = {};
		this.lib = {};
		this.ss = {};
	}

	FlashCanvasManager.prototype.baseManifestPath = function(value) {
		if (value === undefined) {
			return this._baseManifestPath;
		} else {
			this._baseManifestPath = value;
		}
	};

	/**
	 * Resolves a manifest entry path. Override in case you moved the exported flash lib dependencies
	 * to a different folder. If null is returned then the entry won't be loaded.
	 *
	 * @param {Object} entry Manifest entry
	 * @returns {String} The resolved url or null if the item must be omitted.
	 */
	FlashCanvasManager.prototype.resolveManifestPath = function(entry) {
		return entry.src;
	};

	FlashCanvasManager.prototype.attachRoot = function() {
		if (this.stage == null) {
			throw 'Stage is undefined';
		}
		else if (self.root) {
			throw 'Root is already attached';
		}

		this.root = new this.lib[this.rootName]();
		this.dispatchEvent(FlashCanvasManager.Events.STAGE_READY);

		this.stage.addChild(this.root);
		this.stage.update();

		// We should probably clear previous stage. Not sure yet.
		//createjs.Ticker.setFPS(this.lib.properties.fps);
		this.listenForTicks();
		this.dispatchEvent(FlashCanvasManager.Events.ROOT_READY);
	};

	/**
	 * @param {boolean} [value] Default is true
	 */
	FlashCanvasManager.prototype.listenForTicks = function(value) {
		if (!this.stage) return;

		if (value || value === undefined) {
			createjs.Ticker.addEventListener('tick', this.stage);
		} else {
			createjs.Ticker.removeEventListener('tick', this.stage);
		}
	};

	/**
	 * @param {String} scriptPath
	 * @param {String} rootName
	 * @param {Function} [doneCallback]
	 * @returns {Promise}
	 */
	FlashCanvasManager.prototype.loadScript = function(scriptPath, rootName, doneCallback) {
		return this.loadScriptPromise($.get(scriptPath), rootName, doneCallback);
	};


	/**
	 * @param {Promise} scriptPromise
	 * @param {String} rootName
	 * @param {Function} [doneCallback]
	 * @returns {Promise}
	 */
	FlashCanvasManager.prototype.loadScriptPromise = function(scriptPromise, rootName, doneCallback) {
		this.rootName = rootName;
		var self = this;

		scriptPromise.then(
			function(data) {
				if (typeof data === 'object') {
					// Not a string. Search the content in most probable property names;
					data = data.data || data.text || data.response;
				}

				var lib = self.lib;
				var images = self.images;
				var ss = self.ss;  // Spritesheets go here.

				// We are forced to use eval due to the way flash exports the content.
				// Remove duplicate values and execute the script;
				eval(data.substr(0, data.lastIndexOf(');') + 2)); // jshint ignore:line

				// CreateJS load queue modifies URLs when objects are loaded. If we implement caching then
				// loading cached objects will require null for basePath after the first load.
				self.loadDependencies(lib.properties.manifest, self._baseManifestPath, function() {
					if (self._isDisposed) return;

					self.attachRoot();
					self.dispatchEvent(FlashCanvasManager.Events.SCRIPT_LOADED);

					if (doneCallback) {
						doneCallback();
					}
				});
			},
			function() {
				if (console && console.warn) {
					console.warn('Can load createjs script file.');
				}
			}
		);

		return scriptPromise;
	};

	/**
	 * @param {Array} manifest
	 */
	FlashCanvasManager.prototype.loadDependencies = function(manifest, basePath, doneCallback) {
		if (!this.rootName) {
			throw 'Set rootName before loading dependencies.';
		}

		var loader = new createjs.LoadQueue(false, basePath);
		var self = this;

		var handleFileLoad = function(evt) {
			switch (evt.item.type) {
				case 'sound':
					self._soundObjects.push(evt.item);
					break;

				case 'image':
					self.images[evt.item.id] = evt.result;
					break;

				case 'spritesheet':
					self.ss[evt.item.id] = evt.result;
					break;
			}
		};

		var handleComplete = function(evt) {
			if (doneCallback) {
				doneCallback();
			}

			loader.destroy();
			self.dispatchEvent(FlashCanvasManager.Events.DEPENDENCIES_LOADED);
		};

		loader.installPlugin(createjs.Sound);
		loader.addEventListener('fileload', handleFileLoad);
		loader.addEventListener('complete', handleComplete);
		loader.addEventListener('initialize', function(e) {
			console.log(e);
		});

		var filteredManifest = [];

		manifest.forEach(function(entry) {
			var resolvedSrc = self.resolveManifestPath(entry);

			if (resolvedSrc) {
				entry.src = resolvedSrc;
				filteredManifest.push(entry);
			}
		});

		if (filteredManifest.length) {
			self.dispatchEvent(
				angular.extend(
					new createjs.Event(FlashCanvasManager.Events.LOAD_MANIFEST), {
						manifest: manifest,
						loadQueue: loader
					}
				)
			);

			loader.loadManifest(filteredManifest);
		} else {
			// For some reason an empty manifest file never completes loading
			handleComplete();
		}
	};

	/**
	 * Removes the root from the stage
	 * @param {Boolean} destroyStage If true then the stage will also be destroyed.
	 */
	FlashCanvasManager.prototype.clearStage = function(destroyStage) {
		if (destroyStage === undefined) {
			throw  'Destroy stage must have a value of "true" or "false".';
		}

		if (destroyStage && this.stage) {
			createjs.Ticker.removeEventListener('tick', this.stage);
			this.dispatchEvent(FlashCanvasManager.Events.STAGE_DESTROY);
			createjs.Touch.disable(this.stage);

			this.stage = null;
		}

		if (this.root) {
			this.dispatchEvent(FlashCanvasManager.Events.ROOT_DESTROY);
			this.root = null;
		}
	};

	FlashCanvasManager.prototype.isDisposed = function() {
		return this._isDisposed;
	};

	/**
	 * Unloads a sound instance and also stops it if it was playing.
	 * Userd internal from the removeSounds function.
	 * @param {String} src
	 * @returns {Boolean} true id the sound was removed
	 * @private
	 */
	FlashCanvasManager.prototype._removeSound = function(src) {
		createjs.Sound.removeSound(src);
	};

	/**
	 * Removes all sounds used by the current canvas. Used by dispose.
	 * TODO: We need internal counter on all sounds so that we won't remove same sound created by other instances.
	 */
	FlashCanvasManager.prototype.removeSounds = function() {
		var self = this;

		if (this._soundObjects) {
			angular.forEach(function(data) {
				self._removeSound(data.src);
			});

			this._soundObjects = [];
		}
	};

	FlashCanvasManager.prototype.dispose = function() {
		if (this._isDisposed) {
			return;
		}

		this._isDisposed = true;
		this.clearStage(true);
		this.removeSounds();

		this.dispatchEvent(FlashCanvasManager.Events.DISPOSE);
	};

	// See http://www.createjs.com/Docs/EaselJS/classes/EventDispatcher.html
	createjs.EventDispatcher.initialize(FlashCanvasManager.prototype);

	window.createjsUtil = window.createjsUtil || {};
	window.createjsUtil.FlashCanvasManager = FlashCanvasManager;
}) (window);

(function() {
	'use strict';

	var XHRRequest = createjs.XHRRequest;
	var XHRRequest_checkError = XHRRequest.prototype._checkError;

	XHRRequest.prototype._checkError = function () {
		// Override of version 0.62 implementation

		if ('cordova' in window) {
			var status = parseInt(this._request.status);

			switch (status) {
				case 404:   // Not Found
				// case 0: arraybuffer load on mobile devices reports 0 but the load is ok
					return new Error(status);
			}
		} else {
			return XHRRequest_checkError.apply(this);
		}

		return null;
	};
}) ();