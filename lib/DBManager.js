/****DBManager.js
 
 
 
 */
(function(window, undefined) {
	"use strict"

	var indexedDB = window.indexedDB || window.msIndexedDB || window.mozIndexedDB || window.webkitIndexedDB;

	var version = "0.1";

	var guid = 0;

	/**
	 * @description
	 * 空
	 *
	 **/

	function noop() {

	}

	/**
	 * @description
	 * 判断是否IDBKeyRange类型
	 *
	 * @param {object}要判断的值
	 *
	 * @return {boolean}
	 **/

	function isIDBKeyRange(value) {
		if (value) {
			return Object.prototype.toString.call(value) === "[object IDBKeyRange]";
		}
		return false;
	}

	/**
	 *@description
	 *空
	 *
	 **/

	function getGuid() {
		return ++guid;
	}

	/**
	 * @description
	 * Request构造函数，用于startMethod传参数
	 *
	 * @param {obj} 调用该方法的对象
	 **/

	function Request(from) {
		this.from = from;
		this.args = Array.prototype.slice.call(arguments, 1);
	}

	Request.prototype = {

		constructor: Request,

		addArgs: function(value) {

			this.args.push(value);
			return this;

		}

	}

	/**
	 * @description
	 * Response构造函数
	 *
	 * @param {string}类型
	 * @param {string}message
	 * @param {object}result
	 *
	 * @return Response
	 **/

	function Response(type, message, result) {

		this.type = type;
		this.message = message;
		this.result = result;
		this.extra = {};
	}

	Response.prototype = {

		constructor: Response,

		putExtra: function(key, value) {

			this.extra[key] = value;
			return this;

		}

	}

	/**
	 * @description
	 * 调用另一个方法
	 *
	 * @param {function} 要执行的方法
	 * @param {Request} 方法请求体
	 **/

	function startMethod(fn, request) {
		var caller = request.from || window;
		fn.apply(caller, request.args);
	}

	/**
	 * @description
	 * MyPromise构造函数，DBM通过继承它来实现promise调用
	 *
	 **/

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

	/**
	 * @description
	 * MyPromise的状态码
	 *
	 **/

	MyPromise.STATUS = {
		PENDING: "pending",
		DONE: "done",
		FAIL: "fail"
	}

	/**
	 * @description
	 * 获取一个stack
	 *
	 **/

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

		/**
		 *@description
		 *then
		 *
		 *@param {function}status为DONE的时候执行
		 *@param {function}status为FAIL的时候执行
		 *
		 *@return
		 **/

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

		/**
		 * @description
		 * 切换状态
		 *
		 * @param {string}reason
		 * @param {string}status
		 * @param {object}then执行时候要传入的data
		 *
		 * @return
		 **/

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

	/**
	 * @description
	 * 打开indexedDB
	 *
	 * @param {name}要打开的indexedDB名称
	 * @param {version}版本号
	 * @param {function}触发事件时候要调用的回调
	 *
	 * @return null
	 **/

	function openIDB(name, version, callback) {

		var request;

		function handle(event) {
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

	/**
	 * @description
	 * 打开indexedDB时触发事件的回调
	 *
	 * @param {IDBRequest}打开indexedDB的请求
	 * @param {event}触发的事件
	 * @param {function}触发事件时候要调用的回调
	 *
	 * @return null
	 **/

	function openIDBHandle(request, event, callback) {
		var response;

		switch (event.type) {
			case "error":
				request.onsuccess = null;
				request.onerror = null;
				request.onupgradeneeded = null;
				response = new Response("error", event.target.error.message, null);
				break;
			case "success":
				request.onsuccess = null;
				request.onerror = null;
				request.onupgradeneeded = null;
				response = new Response("success", "success", event.target.result);
				break;
			case "upgradeneeded":
				response = new Response(
					"upgradeneeded",
					"upgradeneeded",
					event.target.result
					);
				response.putExtra("transaction",event.target.transaction);
				request.onupgradeneeded = null;
				break;
		}

		callback(response);

	}

	/****************************************
	 *                                       *
	 *            DBM对象业务方法            *
	 *   为了代码结构更加清晰所以独立出来    *
	 *                                       *
	 *****************************************/

	/**
	 * @description
	 * 更新indexedDB的版本
	 *
	 * @param {DBM} DBM对象
	 * @param {function} 发生upgreadeneeded事件时候要调用的回调
	 * @param {array} 额外参数，一般是在执行callback的时候需要额外传入的参数可选
	 *
	 * @return null
	 **/

	function changeVersion(self, callback, optional) {
		if (self.opened) {
			self._db.close();
		}
		self.open(Date.now()).immediate(function(data) {
			data.putExtra("args", optional);
			callback(data);
		});
	}

	/**
	 * @description
	 * 打开indexedDB
	 *
	 * @param {DBM} DBM对象
	 *
	 * @return null
	 **/

	function open(self, version) {
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

	/**
	 * @description
	 * 关闭indexedDB
	 *
	 * @param {DBM} DBM对象
	 *
	 * @return null
	 **/

	function close(self) {
		if (self.opened) {
			self._db.close();
			self.opened = false;
		}
	}

	/**
	 * @description
	 * 关闭indexedDB
	 *
	 * @param {DBM} DBM对象
	 *
	 * @return null
	 **/

	function put(self, objectStore, data) {
		self.changeStatus("put", MyPromise.STATUS.PENDING);
		if (!self._db.objectStoreNames.contains(objectStore)) {
			self.changeStatus(
				"put",
				MyPromise.STATUS.FAIL,
				new Response("abort", "objectStore " + objectStore + " does't exist", null));
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
					new Response("success", "成功", null));
			} else {
				self.changeStatus(
					"put",
					MyPromise.STATUS.FAIL,
					new Response("abort", e.target.error.message, null));
			}
		}
		tx.oncomplete = handle;
		tx.onabort = handle;
		var store = tx.objectStore(objectStore);
		for (var i = 0; i < data.length; i++) {
			store.put(data[i].value, data[i].optionalKey);
		}
	}

	function query(self, objectStoreName, indexName, keys, keyRange) {
		self.changeStatus("query", MyPromise.STATUS.PENDING);

		if (!self._db.objectStoreNames.contains(objectStoreName)) {
			throw new Error("objectStore " + objectStoreName + " does't exist");
		}

		var data = [];
		var tx = self._db.transaction([objectStoreName], "readonly");
		var store = tx.objectStore(objectStoreName);

		function handle(e) {
			if (e.type === "complete") {
				self.changeStatus(
					"query",
					MyPromise.STATUS.DONE,
					new Response("success", "success", data));
			} else {
				self.changeStatus(
					"query",
					MyPromise.STATUS.FAIL,
					new Response("error", e.type, e.error.message));
			}

		}

		tx.oncomplete = handle;
		tx.onabort = handle;

		if (indexName) {
			store = store.index(indexName);
		}

		if (Array.isArray(keys)) {
			for (var i = 0; i < keys.length; i++) {
				store.get(keys[i]).onsuccess = function(e) {
					var result = e.target.result;
					(result != null) && (data.push(result));
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

	function del(self, objectStoreName, keys) {
		self.changeStatus("del", MyPromise.STATUS.PENDING);
		var tx = self._db.transaction([objectStoreName], "readwrite");

		tx.oncomplete = function(e) {
			self.changeStatus("del",
				MyPromise.STATUS.DONE,
				new Response("success", "成功", null));
		}
		tx.onabort = function(e) {
			self.changeStatus("del",
				MyPromise.STATUS.FAIL,
				new Response("abort", e.target.error.message, null));
		}
		var store = tx.objectStore(objectStoreName);
		for (var i = 0; i < keys.length; i++) {
			store.delete(keys[i]);
		}
	}

	function contains(self, objectStoreName) {
		var status = self._db.objectStoreNames.contains(objectStoreName);
		self.changeStatus(
			"contains",
			MyPromise.STATUS.DONE,
			new Response("success", "success", status)
		);
	}

	function createObjectStore(data) {
		var db, store, args, objectStoreName, optionalKeyPath, indexs, self;
		if (data.type === "upgradeneeded") {

			db = data.result;

			args = data.extra.args;
			objectStoreName = args.objectStoreName;
			optionalKeyPath = args.optionalKeyPath;
			indexs = args.indexs;
			self = args.self;

			if (db.objectStoreNames.contains(objectStoreName)) {
				self.changeStatus("createObjectStore",
					MyPromise.STATUS.FAIL,
					new Response("error", "objectStore " + objectStoreName + " 已经存在", null)
				);
				return;
			}

			store = db.createObjectStore(objectStoreName, optionalKeyPath);

			for (var i = 0; i < indexs.length; i++) {
				store.createIndex(indexs[i].name, indexs[i].keyPath, indexs[i].optional || {
					unique: false
				});
			}

			//创建成功后暂停执行后面的方法，等待success
			self.changeStatus("createObjectStore",
				MyPromise.STATUS.PENDING,
				new Response("success", "objectStore " + objectStoreName + " 创建成功", null)
			);

		}

	}

	function deleteObjectStore(data) {
		var db, store, tx, args, objectStoreName, self;
		if (data.type === "upgradeneeded") {

			db = data.result;
			tx = data.extra.transaction;
			args = data.extra.args;
			objectStoreName = args.objectStoreName;
			self = args.self;

			try {
				db.deleteObjectStore(objectStoreName);
				//等待成功的回调
				self.changeStatus(
					"deleteObjectStore",
					MyPromise.STATUS.PENDING);
			} catch (e) {
				self.changeStatus(
					"deleteObjectStore",
					MyPromise.STATUS.FAIL,
					new Response("error", e.message, null));
			}
		}
	}

	function createIndex(data) {

		var db, store, tx, objectStoreName, indexs, self;

		if (data.type === "upgradeneeded") {

			db = data.result;
			tx = data.extra.transaction;

			objectStoreName = data.extra.args.objectStoreName;
			indexs = data.extra.args.indexs;
			self = data.extra.args.self;

			tx.oncomplete = function(e) {
				self.changeStatus(
					"createIndex",
					MyPromise.STATUS.PENDING);
			}
			tx.onabort = function(e) {
				self.changeStatus(
					"createIndex",
					MyPromise.STATUS.FAIL,
					new Response("abort", e.target.error.message, null));
			}
			store = tx.objectStore(objectStoreName);
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

	function deleteIndex(data) {

		var db, store, tx, self, objectStoreName, indexNames;

		if (data.type === "upgradeneeded") {

			db = data.result;

			objectStoreName = data.extra.args.objectStoreName;
			indexNames = data.extra.args.indexNames;
			self = data.extra.args.self;

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
					new Response("abort", e.target.error.message, null));
			}

			store = tx.objectStore(objectStoreName);

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

	/****************************************
	 *                                       *
	 *            DBM对象业务方法END         *
	 *                                       *
	 *****************************************/

	/*
	 *@description
	 *DBM构造函数
	 *
	 *@param {string}要创建或者打开的indexedDB名称
	 *
	 *@return {DBM}
	 */

	function DBM(name) {
		if (typeof name !== "string") {
			throw new Error("illegal name");
		}
		this._name = name;
		this._db = null;
		this._version = 0;
		MyPromise.call(this);
		this.changeStatus("Constructor", MyPromise.STATUS.DONE);
		this.open();

	}

	DBM.prototype = new MyPromise();

	DBM.prototype.constructor = DBM;

	/**
	 * @description
	 * 关闭数据库
	 *
	 * @param null
	 *
	 * @return {DBM}
	 **/

	DBM.prototype.close = function() {
		var self = this;
		this.then(function() {
			close(self);
		});
		return this;
	};

	/**
	 * @description
	 * 打开数据库
	 *
	 * @param {number}版本号 可选
	 *
	 * @return {DBM}
	 **/

	DBM.prototype.open = function(version) {

		var self = this;
		this.then(function() {
			open(self, version);
		});
		return this;
	};

	/**
	 * @description
	 * 插入值,key相同会覆盖
	 *
	 * @param {string}ObjectStore的名称
	 * @parem {array}插入的值
	 *
	 * @return {DBM}
	 **/

	DBM.prototype.put = function(objectStore, data) {
		var self = this;
		this.then(function() {
			put(self, objectStore, data);
		});
		return this;
	};

	/**
	 * @description
	 * 查询
	 *
	 * @param {string}ObjectStore的名称
	 * @param {string}索引名称 可选，不传入则按照keyPath来查询
	 * @parem {array}要查的keys 可选，不传入则获取全部数据
	 * @parma {IDBKeyRange}查找范围 可选
	 *
	 * @return {DBM}
	 **/

	DBM.prototype.query = function(objectStoreName, indexName, keys, keyRange) {
		var self = this;
		if (!objectStoreName) {
			throw new Error("objectStoreName is undefined");
		}
		indexName = indexName || undefined;
		if (typeof indexName !== "string") {
			keyRange = keys;
			keys = indexName;
			indexName = undefined;
		}
		if (!Array.isArray(keys)) {
			keyRange = keys;
			keys = undefined;
		}

		if (!isIDBKeyRange(keyRange)) {
			keyRange = undefined;
		}
		this.then(function() {
			query(self, objectStoreName, indexName, keys, keyRange);
		});
		return this;

	};
	/**
	 * @description
	 * 删除值
	 *
	 * @param {string}ObjectStore的名称
	 * @parem {array}要删除的值的keys
	 *
	 * @return {DBM}
	 **/
	DBM.prototype.del = function(objectStoreName, keys) {
		var self = this;
		this.then(function() {
			del(self, objectStoreName, keys)
		});
		return this;
	};

	/**
	 * @description
	 * 检查objectStore是否已经存在
	 *
	 * @param {string}要检查的ObjectStore的名称
	 *
	 * @return {DBM}
	 **/

	DBM.prototype.contains = function(objectStoreName) {

		var self = this;
		this.then(function() {
			contains(self, objectStoreName);
		});
		return this;
	};

	/**
	 * @description
	 * 创建一个新的ObjectStore
	 *
	 * @param {string} 要创建的ObjectStore的名称
	 * @param {object} keyPath,可选
	 * @param {Array} ObjectStore的索引，可选
	 *
	 * @return {DBM}
	 **/

	DBM.prototype.createObjectStore = function(objectStoreName, optionalKeyPath, indexs) {
		if (!objectStoreName) {
			throw new Error("objectStoreName is undefined");
		}
		if (Array.isArray(optionalKeyPath)) {
			indexs = optionalKeyPath;
			optionalKeyPath = undefined;
		}
		indexs = indexs || [];

		var self = this;
		var args = {
			self: self,
			objectStoreName: objectStoreName,
			optionalKeyPath: optionalKeyPath,
			indexs: indexs
		};

		this.then(function() {

			var request = new Request(self, self, createObjectStore);

			request.addArgs(args);

			startMethod(changeVersion, request);

		});

		return this;
	};

	/**
	 * @description
	 * 删除一个已经存在的ObjectStore
	 *
	 * @param {string} 要删除的ObjectStore的名称
	 *
	 * @return {DBM}
	 **/

	DBM.prototype.deleteObjectStore = function(objectStoreName) {
		var self = this;

		var args = {
			self: self,
			objectStoreName: objectStoreName
		}

		this.then(function() {

			var request = new Request(self, self, deleteObjectStore);

			request.addArgs(args);

			startMethod(changeVersion, request);

		});

		return this;
	};

	/**
	 * @description
	 * 创建索引
	 *
	 * @param {string} ObjectStore的名称
	 * @param {array}  索引值，和createObjectStore方法中indexs参数类型相同
	 *
	 * @return {DBM}
	 **/

	DBM.prototype.createIndex = function(objectStoreName, indexs) {
		var self = this;
		indexs = indexs || [];

		var args = {
			self: self,
			objectStoreName: objectStoreName,
			indexs: indexs
		}

		this.then(function() {

			var request = new Request(self, self, createIndex);

			request.addArgs(args);

			startMethod(changeVersion, request);

		});

		return this;
	};

	/**
	 * @description
	 * 删除索引
	 *
	 * @param {string} ObjectStore的名称
	 * @param {array}  索引名称
	 *
	 * @return {DBM}
	 **/

	DBM.prototype.deleteIndex = function(objectStoreName, indexNames) {
		var self = this;
		indexNames = indexNames || [];

		var args = {
			self: self,
			objectStoreName: objectStoreName,
			indexNames: indexNames
		}

		this.then(function() {

			var request = new Request(self, self, deleteIndex);

			request.addArgs(args);

			startMethod(changeVersion, request);

		});

		return this;
	};

	/**
	 * @description
	 * 删除数据库
	 *
	 * @param {string} 数据库的名称
	 *
	 * @return {DBM}
	 **/

	DBM.prototype.deleteDataBase = function() {
		var name = this._name;

		this.close().then(function() {
			DBM.deleteDataBase(name);
		});

		return this;
	}

	/**
	 * @description
	 * 删除数据库
	 *
	 * @param {string} 数据库的名称
	 * @param {function} 删除数据库后执行的回调，可选
	 **/

	DBM.deleteDataBase = function(name, callback) {
		var request = indexedDB.deleteDatabase(name);
		callback = callback || noop;
		var response;
		var handle = function(event) {
			if (event.type === "error") {
				request.onerror = null;
				result.onsuccess = null;
				response = new Response("error", event.target.error.message, null);
			} else if (event.type === "success") {
				request.onerror = null;
				request.onsuccess = null;
				response = new Response("success", "success", null)
			}

			callback(response);
		}
		request.onerror = handle;
		request.onsuccess = handle;
	}

	/**
	 * @description
	 * version
	 **/

	DBM.VERSION = version;

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