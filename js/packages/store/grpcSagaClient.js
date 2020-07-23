import * as api from '@berty-tech/api'
import { eventChannel, END } from 'redux-saga'
import { grpc } from '@improbable-eng/grpc-web'
import { MessengerService } from '../protocol/grpc-web-gen/bertymessenger_pb_service'
import * as bertymessenger from '../protocol/grpc-web-gen/bertymessenger_pb'

console.log('messenger service', MessengerService)

class GRPCError extends Error {
	constructor(message) {
		super(message)
		this.name = 'GRPCError'
	}
}

const capitalize = (str) => {
	if (typeof str === 'string') {
		return str.replace(/^\w/, (c) => c.toUpperCase())
	} else {
		return str
	}
}

export default ({ Service, Methods, api, gwAPI }) => {
	const cls = class {
		constructor(host, transport) {
			this.host = host
			this.transport = transport
		}
	}
	for (const m of Methods) {
		const cm = capitalize(m)
		const APIObj = api[cm]
		const GWAPIObj = gwAPI[cm]
		cls.prototype[m] = (requestObj = {}) =>
			eventChannel((emit) => {
				const buf = APIObj.Request.encode(requestObj).finish()
				const request = GWAPIObj.Request.deserializeBinary(buf)
				const { close } = grpc.invoke(Service[cm], {
					request,
					transport: this.transport,
					host: this.host,
					onMessage: (message) => emit(APIObj.Reply.decode(message.serializeBinary())),
					onEnd: (code, msg, trailers) => {
						if (code !== grpc.Code.OK) {
							emit(
								new GRPCError(
									`GRPC InstanceShareableBertyID ${
										grpc.Code[code]
									} (${code}): ${msg}\nTrailers: ${JSON.stringify(trailers)}`,
								),
							)
						}
						emit(END)
					},
				})
				return close
			})
	}
	return cls
}
