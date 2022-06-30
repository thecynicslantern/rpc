const idChars = "0123456789abcdefghijklmnopqrstuvxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_=_+[]{};':@,./<>?!£$%^&*()";
const createId = (length) => {
	let s = "";
	for(let i = 0; i < length; i++){
		s += idChars[Math.floor(Math.random() * idChars.length)];
	}	
	return s;
};

const proxyDef = {
	get: (context, method) => (...args) => {
		const callId = createId(10);
		return new Promise((resolve, reject) => {
			context.callIds[callId] = {resolve, reject, debug: {method, args} };
			if (context.socket.readyState !== 1) throw new Error("Not connected");
			context.socket.send(JSON.stringify({
				id: callId,
				method,
				args: args.map(arg => context.convertValueOut(arg, context.callbackCache))
			}));
		});
	}
};

const virtualCallbackKey = "hxj6v3dfqd7ek40ds7t5m2bsfa5fbn3eyjRzpPyopp2SJbT";

module.exports = {
	init: (options) => {
		const { socket, thisContext, onClose, onWarn, methods, throwBack } = options;
		const callIds = {};
		const addEventListener = (socket.addEventListener || socket.on).bind(socket);

		const callbackCache = {};

		const convertValueOut = (val, cache, maxDepth = 32) => {
			if (maxDepth-- == 0) throw new Error("Maximum object depth exceeded");
			if (!val) return val;
			if (!cache) {
				debugger;
			}
			if (val instanceof Function) {
				const callbackKey = createId(16);
				cache[callbackKey] = val;
				return {
					[virtualCallbackKey]: callbackKey,
				};
			}
			if (Array.isArray(val)){
				return val.map(v => convertValueOut(v, cache, maxDepth - 1));
			}
			if (typeof val === "object") {
				const out = {};
				Object.keys(val).forEach(key => {
					const value = convertValueOut(val[key], cache, maxDepth - 1);
					out[key] = value;
				});
				return out;
			}
			return val;
		};


		const callbackCacheKey = createId(10);
		callbackCache[callbackCacheKey] = {};
		const cache = callbackCache[callbackCacheKey];

		const convertValueIn = (val) => {
			if (Array.isArray(val)) return val.map(v => convertValueIn(v));
			if (typeof val !== "object") return val;
			const callbackKey = val[virtualCallbackKey];
			if (callbackKey === undefined) {
				const out = {};
				console.log("conv rec obj", val);
				Object.keys(val).forEach(k => out[k] = convertValueIn(val[k]));
				return out;
			}
			const sendCallbackRequest = (...args) => new Promise((resolve, reject) => {
				const callId = createId(10);
				callIds[callId] = {resolve, reject, debug: {method: "{callback}", args} };
				socket.send(JSON.stringify({
					callback: callbackKey,
					callId,
					args: convertValueOut(args, cache),
				})); // todo: use throwBack
			});
			return (...args) => sendCallbackRequest(...args);
		};

		addEventListener("close", event => {
			if (onClose) onClose();
			Object.keys(callIds).forEach(id => {
				const promise = callIds[id];
				if (onWarn && promise.debug) onWarn("Connection closed during " + promise.debug.method + "() call");
			});
		});
	
		addEventListener("message", async event => {
			const callData = JSON.parse(event.data);
			if (callData.responseTo){
				const promise = callIds[callData.responseTo];
				delete callIds[callData.responseTo];
				if (callData.error !== undefined){
					const msg = typeof callData.error == "string" ? callData.error : `${callData.constructor.name} ${callData.error.message}`;
					if(onWarn){
						onWarn("Remote " + msg);
					} else {
						throw new Error("Remote " + msg);
					}
				} else {
					promise.resolve(convertValueIn(callData.result, cache));
				}
				return;
			}
			if (callData.callback) {
				const fn = cache[callData.callback];
				const result = await fn(...convertValueIn(callData.args, cache));
				if (result instanceof Promise) {
					result.then(val => {
						socket.send(JSON.stringify({
							responseTo: callData.callId,
							result: convertValueOut(val, cache),
							debug: callData.debug,
						}));
					});
				} else {
					socket.send(JSON.stringify({
						responseTo: callData.callId,
						result: convertValueOut(result, cache),
						debug: callData.debug,
					}));
				}
				return;
			}

			const remoteThrow = err => {
				if (throwBack){
					const msg = typeof err == "string" ? err : `${err.constructor.name} ${err.message}`;
					const argsOut = convertValueOut(args, cache);
					socket.send(JSON.stringify({
						responseTo: id,
						debug: {method, args: argsOut},
						error: msg,
					}));
				} else {
					throw err;
				}
			};
	
			const { id, method, args } = callData;
			if(!methods[method]) {
				remoteThrow(new Error("No such RPC method: " + method));
				return;
			}

			let result;
			try {
				const outArgs = convertValueIn(args, cache);
				result = methods[method].apply(thisContext, outArgs);
			} catch (e) {
				remoteThrow(e);
				return;
			}

			if (result instanceof Promise) {
				result.then(promiseResult => {
					socket.send(JSON.stringify({
						responseTo: id,
						result: convertValueOut(promiseResult, cache)
					}));
				}).catch(err => remoteThrow(err));
			} else {
				socket.send(JSON.stringify({
					responseTo: id,
					result: convertValueOut(result, cache, obj => socket.send(JSON.stringify(obj)))
				}));
			}
		});

		return new Proxy({socket, callIds, callbackCache: cache, convertValueOut}, proxyDef);
	}
}