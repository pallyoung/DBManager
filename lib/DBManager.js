/****DBManager.js



*/
(function(window, undefined) {
	"use strict"
	var indexedDB = window.indexedDB || window.msIndexedDB || window.mozIndexedDB || window.webkitIndexedDB;
	var version = "0.1";

	var guid = 0;


	function noop() {

	}

	function isIDBKeyRange(value){
		if(value){
			return Object.prototype.toString.call(value)==="[object IDBKeyRange]";
		}
		return false;		
	}

	function getGuid() {
		return ++guid;
	}

	function MyPromise() {
		this._stacks = [];
		this.status = "pending";
		this._cache = [];
		this._reason = "";
		this._data = null;
		this._depth = 0;
		this._stacks.unshift(MyPromise.Stack());
		this._cache = this._stacks[this._depth];

	}
	MyPromise.STATUS = {
		PENDING: "pending",
		DONE: "done",
		FAIL: "fail"
	}
	MyPromise.Stack = function() {
		return {
			resolves: [],
			rejects: [],
			_flength: 0,
			_length: 0
		}
	}
	MyPromise.prototype = {
		constructor: MyPromise,
		then: function(resolve, reject) {
			var self = this;
			var stack = this._cache;
			resolve = resolve || noop;
			reject = reject || resolve;
			stack._length++;
			stack.resolves.push(resolve);
			stack.rejects.push(reject);
			this.fire();
			return this;
		},
		immediate: function(resolve, reject) {
			var stack = this._cache;
			stack = MyPromise.Stack();
			this._stacks.unshift(stack);
			var position = 0; 
			resolve = resolve || noop;
			reject = reject || resolve;
			stack.resolves.splice(position, 0, resolve);
			stack.rejects.splice(position, 0, reject);
			stack._length++
			this.fire();
			return this;
		},
		changeStatus: function(reason, status, data) {
			this._reason = reason;
			this.status = status;
			this._data = data || null;
			this.fire();
		},
		wait: function(fn) {
			var self = this;
			setTimeout(function() {
				fn();
			}, 1);
		},
		_getTopStack: function() {
			var stack = this._stacks[0];
			return stack;
		},
		fire: function() {
			var next;
			var stack = this._getTopStack();
			while (stack && stack.resolves.length === 0 && this._stacks.length !== 0) {
				//把空的stack删掉
				stack = this._getTopStack();
				if (this._stacks.length > 1) {
					this._stacks.shift();
					(--this._depth < 0) && (this._depth = 0);
				} else {
					break;
				}

			}
			if (this.status === MyPromise.STATUS.DONE) {
				next = stack.resolves.shift();
				stack.rejects.shift();
			} else if (this.status === MyPromise.STATUS.FAIL) {
				next = stack.rejects.shift();
				stack.resolves.shift();
			} else {
				return;
			}
			if (typeof next === "function") {
				this._cache = MyPromise.Stack();
				this._stacks.unshift(this._cache);
				this._depth++;
				next.call(this, this._data);
				this._cache = this._stacks[this._depth];
				stack._flength++;
				this.fire();
			}

		}
	}

	function setRequestData(type, message, result,extra) {
		return {
			type: type,
			message: message,
			result: result,
			extra:extra||null
		}
	}

	function openIDB(name, version, callback) {
		var request;
		var handle = function(event) {
			openIDBHandle(request, event, callback);
		};
		if (version) {
			request = indexedDB.open(name, version);
		} else {
			request = indexedDB.open(name);
		}
		request.onerror = handle;
		request.onsuccess = handle;
		request.onupgradeneeded = handle;
		return request;
	}

	function openIDBHandle(request, event, callback) {
		switch (event.type) {
			case "error":
				request.onsuccess = null;
				request.onerror = null;
				request.onupgradeneeded = null;
				callback(setRequestData("error", event.target.error.message,null));
				break;
			case "success":
				request.onsuccess = null;
				request.onerror = null;
				request.onupgradeneeded = null;
				callback(setRequestData("success", "success", event.target.result));
				break;
			case "upgradeneeded":
				callback(setRequestData(
						"upgradeneeded",
					 	"upgradeneeded",
						event.target.result,
						{transaction:event.target.transaction}));
				request.onupgradeneeded = null;
				break;
		}
	}

	function changeVersion(callback) {
		if (this.opened) {
			this._db.close();
		}
		var self = this;
		this.open(Date.now()).immediate(function(data) {
			callback(data);
		});
	}

	function DBM(name) {
		if (typeof name !== "string") {
			throw new Error("illegal name");
		}
		this._name = name;
		this._db = null;
		this._version = 0;
		MyPromise.call(this);
		this.changeStatus("start", MyPromise.STATUS.DONE);
		this.open();

	}
	DBM.prototype = new MyPromise();

	DBM.prototype.constructor = DBM;
	DBM.prototype.close = function() {
		var self = this;

		this.then(_close);

		function _close() {
			if (self.opened) {
				self._db.close();
				self.opened = false;
			}
		}
		return this;
	};
	DBM.prototype.open = function(version) {

		var self = this;
		this.then(_open);
		function _open() {
			self.changeStatus("open", MyPromise.STATUS.PENDING);
			var name = self._name;
			var handle = function(data) {
					if (data.type === "success") {
						self._db = data.result;
						self.version = data.result.version;
						self.opened = true;
						self.changeStatus("open", MyPromise.STATUS.DONE, data);
					} else if (data.type === "error") {
						self.changeStatus("open", MyPromise.STATUS.FAIL, data);
					} else if (data.type === "upgradeneeded") {
						if (version) {
							self.changeStatus("upgradeneeded", MyPromise.STATUS.DONE, data);
						}

					}
				}
			openIDB(name, version, handle);
		}

		return this;
	};
	DBM.prototype.put = function(objectStore, data) {
		var self = this;
		var promise = this._promise;
		this.then(function() {
			_put(objectStore, data);
		});

		function _put(objectStore, data) {
			self.changeStatus("put", MyPromise.STATUS.PENDING);
			if (!self._db.objectStoreNames.contains(objectStore)) {
				self.changeStatus(
					"put",
					MyPromise.STATUS.FAIL,
					setRequestData("abort", "objectStore " + objectStore + " does't exist", null));
				return;
			}
			var tx = self._db.transaction([objectStore], "readwrite");

			var handle = function(e) {
				tx.oncomplete = null;
				tx.onabort = null;
				if (e.type === "complete") {
					self.changeStatus(
						"put",
						MyPromise.STATUS.DONE,
						setRequestData("success", "成功", null));
				} else {
					self.changeStatus(
						"put",
						MyPromise.STATUS.FAIL,
						setRequestData("abort", e.target.error.message, null));
				}
			}
			tx.oncomplete = handle;
			tx.onabort = handle;
			var store = tx.objectStore(objectStore);
			for (var i = 0; i < data.length; i++) {
				store.put(data[i]);
			}
		}
		return this;
	};
	DBM.prototype.query = function(objectStore,indexName,keys, keyRange,direction) {
		var self = this;
		if(!objectStore){
			throw new Error("objectStore name is undefined");
		}
		indexName = indexName ||undefined;
		if(typeof indexName !=="string"){
			direction = keyRange;
			keyRange = keys;
			keys = indexName;
			indexName = undefined;
		}
		if(!Array.isArray(keys)){
			direction = keyRange;
			keyRange = keys;
			keys = undefined;
		}

		if(!isIDBKeyRange(keyRange)){
			direction = keyRange;
			keyRange = undefined;
		}
		direction = direction||undefined;
		this.then(function() {
			_query(objectStore,indexName,keys, keyRange,direction);
		});

		function _query(objectStore,indexName,keys,keyRange, direction) {
			self.changeStatus("query", MyPromise.STATUS.PENDING);
			var data = [];
			if (!self._db.objectStoreNames.contains(objectStore)) {
				throw new Error("objectStore " + objectStore + " does't exist");
			}
			var tx = self._db.transaction([objectStore], "readonly");
			var store = tx.objectStore(objectStore);

			var handle = function(e) {
				if (e.type === "complete") {
					self.changeStatus(
						"query",
						MyPromise.STATUS.DONE, {
							type: "success",
							message: "success",
							result: data
						});					
				} else {
					self.changeStatus(
						"query",
						MyPromise.STATUS.FAIL,
						setRequestData("error",e.type,e.error.message));
				}

			}
			tx.oncomplete = handle;
			tx.onabort = handle;
			
			if(indexName){
				store=store.index(indexName);
			}
			if (Array.isArray(keys)) {
				for (var i = 0; i < keys.length; i++) {
					store.get(keys[i]).onsuccess=function(e){
						var result =e.target.result;
						(result!==null)&&(data.push(e.target.result));
					};
				}
				return;
			}
			store.openCursor(keyRange).onsuccess = function(e) {
				var cursor = e.target.result;
				if (cursor) {
					data.push(cursor.value);
					cursor.continue();
				}
			};
		}
		return this;

	};
	DBM.prototype.del = function(objectStore, keys) {
		var self = this;
		this.then(function() {
			_del(objectStore, keys)
		});

		function _del(objectStore, keys) {
			self.changeStatus("del", MyPromise.STATUS.PENDING);
			var tx = self._db.transaction([objectStore], "readwrite");

			tx.oncomplete = function(e) {
				self.changeStatus("del",
					MyPromise.STATUS.DONE,
					setRequestData("success", "成功", null));
			}
			tx.onabort = function(e) {
				self.changeStatus("del",
					MyPromise.STATUS.FAIL,
					setRequestData("abort", e.target.error.message, null));
			}
			var store = tx.objectStore(objectStore);
			for (var i = 0; i < keys.length; i++) {
				store.delete(keys[i]);
			}
		}
		return this;
	};
	DBM.prototype.deleteObjectStore = function(objectStore) {
		var self = this;
		this.then(promiseCB);

		function _deleteObjectStore(data) {
			var db, store,tx;
			if (data.type === "upgradeneeded") {
				db = data.result;
				tx = data.extra.transaction;
				try {
					db.deleteObjectStore(objectStore);
					//等待成功的回调
					self.changeStatus(
						"deleteObjectStore",
						MyPromise.STATUS.PENDING);
				} catch (e) {
					self.changeStatus(
						"deleteObjectStore",
						MyPromise.STATUS.FAIL,
						setRequestData("error", e.message, null));
				}
			}
		}

		function promiseCB() {
			changeVersion.call(self, _deleteObjectStore);
		}
		return this;
	};
	DBM.prototype.createObjectStore = function(objectStore, keyPath, autoIncrement, index) {
		autoIncrement = autoIncrement || false;
		index = index || [];
		if (Array.isArray(autoIncrement)) {
			index = autoIncrement;
			autoIncrement = false;
		}
		var self = this;

		function _createObjectStore(data) {
			var db, store;
			if (data.type === "upgradeneeded") {
				db = data.result;
				if (db.objectStoreNames.contains(objectStore)) {
					self.changeStatus("createObjectStore",
						MyPromise.STATUS.FAIL,
						setRequestData("error", "objectStore " + objectStore + " 已经存在", null)
					);
					return;
				}
				store = db.createObjectStore(objectStore, {
					keyPath: keyPath,
					autoIncrement: autoIncrement || false
				});
				for (var i = 0; i < index.length; i++) {
					store.createIndex(index[i].name, index[i].keyPath, index[i].optional || {
						unique: false
					});
				}
				//创建成功后暂停执行后面的方法，等待success
				self.changeStatus("createObjectStore",
					MyPromise.STATUS.PENDING,
					setRequestData("success", "objectStore " + objectStore + " 创建成功", null)
				);

			}

		}

		function promiseCB() {
			changeVersion.call(self, _createObjectStore);
		}
		this.then(promiseCB, promiseCB);
		return this;
	};
	DBM.prototype.contains = function(objectStore) {

		var self = this;

		function _contains(objectStore) {
			var status = self._db.objectStoreNames.contains(objectStore);
			self.changeStatus("contains",
				MyPromise.STATUS.DONE,
				setRequestData("success", "success", status)
			);
		}
		this.then(function() {
			_contains(objectStore);
		});
		return this;
	};
	DBM.prototype.deleteIndex = function(objectStore, indexNames) {
		var self = this;
		var name = this._name;
		indexNames = indexNames || [];

		this.then(promiseCB);

		function _deleteIndex (data) {
			var db, store, tx;
			if (data.type === "upgradeneeded") {
				db = data.result;
				tx = data.extra.transaction;
				tx.oncomplete = function(e) {
					self.changeStatus(
						"deleteIndex",
						MyPromise.STATUS.PENDING);
				}
				tx.onabort = function(e) {
					self.changeStatus(
						"deleteIndex",
						MyPromise.STATUS.FAIL,
						setRequestData("abort", e.target.error.message, null));
				}
				store = tx.objectStore(objectStore);
				for (var i = 0; i < indexNames.length; i++) {
					store.deleteIndex(indexNames[i]);
				}
			} else if (data.type === "error") {
				self.changeStatus(
					"deleteIndex",
					MyPromise.STATUS.FAIL,
					data);
			}

		}

		function promiseCB() {
			changeVersion.call(self, _deleteIndex);
		}
		return this;
	};
	DBM.prototype.createIndex = function(objectStore, indexs) {
		var self = this;
		var name = this._name;
		indexs = indexs || [];
		this.then(promiseCB);
		function _createIndex(data) {
			var db, store, tx;
			if (data.type === "upgradeneeded") {
				db = data.result;
				tx = data.extra.transaction;
				tx.oncomplete = function(e) {
					self.changeStatus(
						"createIndex",
						MyPromise.STATUS.PENDING);
				}
				tx.onabort = function(e) {
					self.changeStatus(
						"createIndex",
						MyPromise.STATUS.FAIL,
						setRequestData("abort", e.target.error.message, null));
				}
				store = tx.objectStore(objectStore);
				for (var i = 0; i < indexs.length; i++) {
					store.createIndex(indexs[i].name, indexs[i].keyPath, indexs[i].optional || {
						unique: false
					});
				}
			} else if (data.type === "error") {
				self.changeStatus(
					"createIndex",
					MyPromise.STATUS.FAIL,
					data);
			}
		}

		function promiseCB() {
			changeVersion.call(self, _createIndex);
		}
		return this;
	};
	DBM.prototype.deleteDataBase = function() {
		var name = this._name;
		this.close().then(function() {
			DBM.deleteDataBase(name);
		});
	}
	DBM.deleteDataBase = function(name, callback) {
		var request = indexedDB.deleteDatabase(name);
		callback = callback || noop;
		var handle = function(event) {
			if (event.type === "error") {
				request.onerror = null;
				result.onsuccess = null;
				callback(setRequestData("error", event.target.error.message, null));
			} else if (event.type === "success") {
				request.onerror = null;
				request.onsuccess = null;
				callback(setRequestData("success", "success", null));
			}
		}
		request.onerror = handle;
		request.onsuccess = handle;
	}
	DBM.VERSION=version;
	if (typeof define === 'function' && define.amd) {
		define(function() {
			return DBM;
		});
	} else if (typeof exports !== 'undefined') {
		exports.DBM = DBM;
	} else {
		window.DBM = DBM;
	}
})(window);