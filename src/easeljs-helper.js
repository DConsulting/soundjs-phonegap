(function(window) {
	'use strict';

	FlashCanvasManager.Events = {
		DEPENDENCIES_LOADED: 'dependencies_loaded',
		SCRIPT_LOADED: 'script_complete',
		STAGE_CREATED: 'stage_created',
		STAGE_DESTROY: 'stage_destroy',
		ROOT_READY: 'root_ready',
		ROOT_DESTROY: 'root_destroy',
		LOAD_MANIFEST: 'load_manifest',
		DISPOSE: 'dispose'
	};

	function FlashCanvasManager(canvasElement) {
		if (!FlashCanvasManager.moviesCache) {
			FlashCanvasManager.moviesCache = new createjsUtil.MoviesCache();
		}

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
	 * CAN OVERRIDE
	 * Override if you want to update stage and root properties before the root is attached to the stage.
	 */
	FlashCanvasManager.prototype.prepareStage = function(stage, root) {

	};

	/**
	 * CAN OVERRIDE
	 *
	 * Resolves a manifest entry path. Override in case you moved the exported flash lib dependencies
	 * to a different folder. If null is returned then the entry won't be loaded.
	 *
	 * @param {Object} entry Manifest entry
	 * @returns {String} The resolved url or null if the item must be omitted.
	 */
	FlashCanvasManager.prototype.resolveManifestPath = function(entry) {
		return entry.src;
	};

	/**
	 * Override to allow movie caching. If you are giving custom promise on load there is no way to detect the url.
	 * @param {Promise} [promise]
	 * @returns {String}
	 */
	FlashCanvasManager.prototype.cacheIdForPromise = function(promise) {
		return null;
	};

	FlashCanvasManager.prototype.attachRoot = function() {
		if (this.stage == null) {
			throw 'Stage is undefined';
		}
		else if (self.root) {
			throw 'Root is already attached';
		}

		this.root = new this.lib[this.rootName]();

		this.prepareStage(this.stage, this.root, this.lib);
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

		if (value || angular.isUndefined(value)) {
			createjs.Ticker.addEventListener('tick', this.stage);
		} else {
			createjs.Ticker.removeEventListener('tick', this.stage);
		}
	};

	FlashCanvasManager.prototype.loadScript = function(scriptPath, rootName, doneCallback) {
		// TODO: Complete method implementation. Use createjs loader
		this.cacheIdForPromise = function(promise) { return scriptPath; };
	};


	FlashCanvasManager.prototype.loadScriptPromise = function(promise, rootName, doneCallback) {
		this.rootName = rootName;
		var self = this;
		var cacheId = self.cacheIdForPromise(promise);

		promise.then(
			function(data) {
				if (typeof data === 'object') {
					// Not a string. Search the content in most probable property names;
					data = data.data || data.text || data.response;
				}

				var lib, images, cachedMovie;
				var ss; // Spritesheet go here.

				if (cacheId && FlashCanvasManager.moviesCache.contains(cacheId)) {
					cachedMovie = FlashCanvasManager.moviesCache.get(cacheId);
					lib = self.lib = cachedMovie.lib;
					images = self.images = cachedMovie.images;
					ss = cachedMovie.ss;
				}
				else {
					lib = self.lib;
					images = self.images;
					ss = self.ss;

					// We are forced to use eval due to the way flash exports the content.
					// Remove duplicate values and execute the script;
					eval(data.substr(0, data.lastIndexOf(');') + 2)); // jshint ignore:line

					if (cacheId) {
						FlashCanvasManager.moviesCache.add(cacheId, lib, images, ss);
					}
				}

				// CreateJS load queue modifies URLs so prevent using basePath with cached objects.
				var baseManifestPath = cachedMovie == null ? self._baseManifestPath : null;

				self.loadDependencies(lib.properties.manifest, baseManifestPath, function() {
					if (self._isDisposed) return;
					
					self.dispatchEvent(FlashCanvasManager.Events.SCRIPT_LOADED);
					self.attachRoot();

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

		if (manifest.length) {
			self.dispatchEvent(
				angular.extend(
					new createjs.Event(FlashCanvasManager.Events.LOAD_MANIFEST), {
						manifest: manifest,
						loadQueue: loader
					}
				)
			);

			loader.loadManifest(manifest);
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

	FlashCanvasManager.prototype.dispose = function() {
		if (this._isDisposed) {
			return;
		}

		this._isDisposed = true;
		this.clearStage(true);

		if (this._soundObjects) {
			createjs.Sound.removeSounds(this._soundObjects);
		}

		this.dispatchEvent(FlashCanvasManager.Events.DISPOSE);
	};

	// See http://www.createjs.com/Docs/EaselJS/classes/EventDispatcher.html
	createjs.EventDispatcher.initialize(FlashCanvasManager.prototype);

	function MoviesCache() {
		this._cache = {};
	}

	/**
	 *
	 * @param {String} id
	 * @param {Object} lib
	 * @param {Object} [images]
	 * @param {Object} [ss]
	 */
	MoviesCache.prototype.add = function(id, lib, images, ss) {
		// FIXME: Cache temporarily disabled because it breaks going back to home screen functionality.
		return;

		if (lib != null && typeof lib === 'object') {
			this._cache[id] = {lib: lib, images: images || {}, ss: ss || {}};
		} else {
			throw 'Invalid "movie" parameter type. CreateJS library expected.';
		}
	};

	/**
	 * @param {String} id
	 * @returns {Boolean}
	 */
	MoviesCache.prototype.contains = function(id) {
		return this._cache[id] != null; // jshint ignore:line
	};

	/**
	 * @param {String} id
	 * @returns {MoveClip}
	 */
	MoviesCache.prototype.get = function(id) { return this._cache[id]; };

	/**
	 * @param {String} id
	 */
	MoviesCache.prototype.remove = function(id) {
		if (this._cache[id]) {
			delete this._cache[id];
		}
	};

	MoviesCache.prototype.clear = function() {
		this._cache = {};
	};

	window.createjsUtil = window.createjsUtil || {};
	window.createjsUtil.FlashCanvasManager = FlashCanvasManager;
	window.createjsUtil.MoviesCache = MoviesCache;
}) (window);