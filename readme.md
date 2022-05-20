# expose methods between node server and web client

straightforward, functional, room for polish. remote throwing. uses websockets.

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
			clients = clients.filter(c => c === client);
			clients.forEach(c => c.write(`* ${name} has left`)); // <- call write() on the server, as exposed by its RPC.init()
			delete users[id];
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
			write: async (s) => outputElement.appendChild(new Text(s + "\n"),
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