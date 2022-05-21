const proxyDef = {
	get: (context, method) => (...args) => {
		const callId = (""+Math.random()*10).replace(".", "");
		return new Promise((resolve, reject) => {
			context.callIds[callId] = {resolve, reject, debug: {method, args} };
			if (context.socket.readyState !== 1) throw new Error("Not connected");
			context.socket.send(JSON.stringify({
				id: callId,
				method,
				args
			}));
		});
	}
};

module.exports = {
	init: (options) => {
		const { socket, thisContext, onClose, onWarn, methods, throwBack } = options;
		const console = options.console || window.console;
		const callIds = {};
		const addEventListener = (socket.addEventListener || socket.on).bind(socket);

		addEventListener("close", event => {
			if (onClose) onClose();
			Object.keys(callIds).forEach(id => {
				const promise = callIds[id];
				if (onWarn) onWarn("Connection closed during " + promise.debug.method + "() call");
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
					promise.resolve(callData.result);
				}
				return;
			}

			const remoteThrow = err => {
				if (throwBack){
					const msg = typeof err == "string" ? err : `${err.constructor.name} ${err.message}`;
					socket.send(JSON.stringify({
						responseTo: id,
						debug: {method, args},
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
			methods[method].apply(thisContext, args).then(result => {
				socket.send(JSON.stringify({
					responseTo: id,
					result
				}));	
			}).catch(err => remoteThrow(err));
		});

		return new Proxy({socket, callIds}, proxyDef);
	}
}