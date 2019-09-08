/*
ISC License (ISC)

Copyright 2019 James Adam Armstrong

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above copyright
notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
*/

import { Server, ServerSocket } from 'veza'
import getPort from 'get-port'
import random from 'random'
import * as IPC from './ipc'
import hash from './worker/hash'
import Suite from './worker/suite'

/** Whether a connection has been established. */
let connected = false
/** The name for the parent's veza Client. */
const token = hash(
	process.cwd(),
	(): boolean => false,
	(h): string => process.cwd().length.toString(16) + h + random.int(0, 0xffff).toString(16)
)
/** Whether logging is enabled. */
let logEnabled = process.env.NODE_ENV !== 'production'

/** The suite for managing AVA configurations. */
const suite = new Suite()

/**
 * Loads test information.
 * @param info The Load message begin handled.
 * @param client The socket to send messages too.
 */
async function loadTests(info: IPC.Load, client: ServerSocket): Promise<void> {
	const logger = logEnabled ? console.log : undefined
	const wait: Promise<unknown>[] = []
	const send = (data: IPC.Tree): void => {
		wait.push(
			client.send(data, {
				receptive: false,
			})
		)
	}
	await suite.load(info.file, send, logger)
	await Promise.all(wait)
}

/**
 * Runs tests.
 * @param info The Run message being handled.
 * @param client The socket to send messages too.
 */
async function runTests(info: IPC.Run, client: ServerSocket): Promise<void> {
	const logger = logEnabled ? console.log : undefined
	const wait: Promise<unknown>[] = []
	const send = (data: IPC.Event): void => {
		wait.push(
			client.send(data, {
				receptive: false,
			})
		)
	}
	await suite.run(send, info.run, logger)
	await Promise.all(wait)
}

/**
 * Debugs tests.
 * @param info The Debug message being handled.
 * @param client The socket to send messages too.
 */
async function debugTests(info: IPC.Debug, client: ServerSocket): Promise<void> {
	const logger = logEnabled ? console.log : undefined
	await suite.debug(
		function(config: string, port: number): void {
			client.send({
				type: 'ready',
				config,
				port,
			})
		},
		info.run,
		info.port,
		info.serial,
		logger
	)
}

/** The veza server. Constructed externally. */
declare const connection: Server
connection
	.on('error', (error, client): void => {
		if (client) {
			console.error(`[IPC] Error from ${client.name}:`, error)
		} else {
			console.error(error)
		}
	})
	.on('connect', (client): void => {
		if (client.name === token) {
			if (connected) {
				client.disconnect(true)
				console.error('[Worker] Another connection made.')
			} else {
				connected = true
				if (logEnabled) {
					console.log('[Worker] Connected.')
				}
			}
		} else {
			client.disconnect(true)
			console.error(`[Worker] Connection attempt with: ${client.name}`)
		}
	})
	.on('disconnect', (client): void => {
		if (client.name === token && connected) {
			client.server.close()
		}
	})
	.on('message', (message, client): void => {
		const data = message.data
		if (typeof data === 'object' && data.type && typeof data.type === 'string') {
			const m = data as IPC.Parent
			switch (m.type) {
				case 'log':
					console.log(`[Worker] Setting logging: ${m.enable}`)
					logEnabled = m.enable
					return
				case 'load':
					loadTests(m, client).finally((): void => {
						message.reply(null)
					})
					return
				case 'drop':
					suite.drop(m.id)
					return
				case 'run':
					runTests(m, client).finally((): void => {
						message.reply(null)
					})
					return
				case 'stop':
					suite.cancel()
					return
				case 'debug':
					debugTests(m, client).finally((): void => {
						message.reply(null)
					})
					return
				default:
					throw new TypeError(`Invalid message type: ${data.type}`)
			}
		} else {
			throw new TypeError('Invalid message.')
		}
	})

/** Called to begin serving the connection. */
async function serve(): Promise<void> {
	const port = await getPort()
	try {
		if (logEnabled) {
			console.log(`[Worker] Will listen on port: ${port}`)
		}
		await connection.listen(port, '127.0.0.1')
		if (process.send) {
			process.send(`${port.toString(16)}:${token}`)
		} else {
			console.error('[Worker] Could not send the token to the parent.')
			connection.close()
			process.exitCode = 1
		}
	} catch (error) {
		console.error('[Worker] Failed to establish IPC.', error)
		process.exitCode = 1
	}
}

serve()
