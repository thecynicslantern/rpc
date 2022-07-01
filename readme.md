# expose methods between node server and web client

straightforward, functional, room for polish. remote throwing. uses websockets.

now with trans-network callbacks!

# eg

## server (node)

```js
const ws = require("ws");
const RPC = require("rpc");
const PORT = 41374;

const wss = new ws.Server({ PORT });
wss.on('connection', (socket, req) => {
	initConnection(socket);
};
console.log("Doing a big ol' listen on port", PORT);

let clients = [];

async function initConnection(socket) {
	let name;
	let id = Math.random();

	const client = RPC.init({
		socket,
		onClose: () => {
			clients = clients.filter(c => c !== client);
			clients.forEach(c => c.write(`* ${name} has left`)); // <- call write() on the server, as exposed by its RPC.init()
			delete clients[id];
		},
		methods: { // methods to expose to client
			async say(message) {
				clients.forEach(c => c.write(`<${name}> ${message}`));
			},
		},
	});

	name = await client.requestName();
	clients.forEach(c => c.write(`* ${name} has joined`));

	clients.push(client);
}
```

## client

```js
const RPC = require("rpc");

const protocol = "ws";
const outputElement = document.getElementById("chat-out");
const inputElement = document.getElementById("chat-in");

const socket = new WebSocket(`${protocol}://` + location.hostname + ":" + PORT);
socket.addEventListener("open", event => {
	initConnection(socket);
});

function initConnection(socket){
	const server = RPC.init({
		socket,
		onWarn: err => console.warn("rpc warning:", err),
		onClose: () => delete users[id],
		throwBack: true, // rethrow throws to the remote caller
		methods: { // methods to expose to server
			write: async (s) => outputElement.appendChild(new Text(s + "\n")),
			// remote methods can of course return values:
			requestName: async () => prompt("server is requesting your nickname"),
		},
	});

	inputElement.addEventListener("keypress", event => {
		if (event.key === "Enter"){
			server.say(inputElement.value);
			inputElement.value = "";
		}
	});
}

```

## callback fun

```js

// client
const exposeMethods = {
	doThing: async (num, callback) => {
		if (num < 0)) return callback(null, "too low");
		if (num > 50)) return callback(null, "too high");
		callback(num * 2);
	}
};

// server
const result = client.doThing(6, (result, error) => {
	if (error){
		console.error(error);
	} else {
		console.log("Result:", result);
	}
});
// writes to server console: Result: 12
```

### go wild!

functions can be passed and returned, including as values in arrays and object properties.

```js

// server
const store = {};
const exposeMethods = {
	getStorage: async () => {
		return {
			read: async key => store[key],
			write: async (key, value) => store[key] = value,
		}
	}
};

// client
const storage = await server.getStorage();
const name = await storage.get("name");
await storage.set("thing", 5);

```