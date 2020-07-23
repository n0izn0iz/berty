import * as api from '@berty-tech/api'
import { eventChannel, END } from 'redux-saga'
import { grpc } from '@improbable-eng/grpc-web'
import { MessengerService } from '../protocol/grpc-web-gen/bertymessenger_pb_service'
import * as bertymessenger from '../protocol/grpc-web-gen/bertymessenger_pb'

class GRPCError extends Error {
	constructor(message) {
		super(message)
		this.name = 'GRPCError'
	}
}

export const MessengerMethods = {
	instanceShareableBertyID: 'instanceShareableBertyID',
	shareableBertyGroup: 'shareableBertyGroup',
	devShareInstanceBertyID: 'devShareInstanceBertyID',
	parseDeepLink: 'parseDeepLink',
	sendContactRequest: 'sendContactRequest',
	sendMessage: 'sendMessage',
	sendAck: 'sendAck',
	systemInfo: 'systemInfo',
}

export default class MessengerServiceSagaClient {
	host
	transport

	constructor(host, transport) {
		this.host = host
		this.transport = transport
	}

	instanceShareableBertyID = (requestObj = {}) =>
		eventChannel((emit) => {
			const buf = api.berty.messenger.v1.InstanceShareableBertyID.Request.encode(
				requestObj,
			).finish()
			const request = bertymessenger.InstanceShareableBertyID.Request.deserializeBinary(buf)
			const { close } = grpc.invoke(MessengerService.InstanceShareableBertyID, {
				request,
				transport: this.transport,
				host: this.host,
				onMessage: (message) =>
					emit(
						api.berty.messenger.v1.InstanceShareableBertyID.Reply.decode(message.serializeBinary()),
					),
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
	shareableBertyGroup = (requestObj = {}) =>
		eventChannel((emit) => {
			const buf = api.berty.messenger.v1.ShareableBertyGroup.Request.encode(requestObj).finish()
			const request = bertymessenger.ShareableBertyGroup.Request.deserializeBinary(buf)
			const { close } = grpc.invoke(MessengerService.ShareableBertyGroup, {
				request,
				transport: this.transport,
				host: this.host,
				onMessage: (message) =>
					emit(api.berty.messenger.v1.ShareableBertyGroup.Reply.decode(message.serializeBinary())),
				onEnd: (code, msg, trailers) => {
					if (code !== grpc.Code.OK) {
						emit(
							new GRPCError(
								`GRPC ShareableBertyGroup ${
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
	devShareInstanceBertyID = (requestObj = {}) =>
		eventChannel((emit) => {
			const buf = api.berty.messenger.v1.DevShareInstanceBertyID.Request.encode(requestObj).finish()
			const request = bertymessenger.DevShareInstanceBertyID.Request.deserializeBinary(buf)
			const { close } = grpc.invoke(MessengerService.DevShareInstanceBertyID, {
				request,
				transport: this.transport,
				host: this.host,
				onMessage: (message) =>
					emit(
						api.berty.messenger.v1.DevShareInstanceBertyID.Reply.decode(message.serializeBinary()),
					),
				onEnd: (code, msg, trailers) => {
					if (code !== grpc.Code.OK) {
						emit(
							new GRPCError(
								`GRPC DevShareInstanceBertyID ${
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
	parseDeepLink = (requestObj = {}) =>
		eventChannel((emit) => {
			const buf = api.berty.messenger.v1.ParseDeepLink.Request.encode(requestObj).finish()
			const request = bertymessenger.ParseDeepLink.Request.deserializeBinary(buf)
			const { close } = grpc.invoke(MessengerService.ParseDeepLink, {
				request,
				transport: this.transport,
				host: this.host,
				onMessage: (message) =>
					emit(api.berty.messenger.v1.ParseDeepLink.Reply.decode(message.serializeBinary())),
				onEnd: (code, msg, trailers) => {
					if (code !== grpc.Code.OK) {
						emit(
							new GRPCError(
								`GRPC ParseDeepLink ${
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
	sendContactRequest = (requestObj = {}) =>
		eventChannel((emit) => {
			const buf = api.berty.messenger.v1.SendContactRequest.Request.encode(requestObj).finish()
			const request = bertymessenger.SendContactRequest.Request.deserializeBinary(buf)
			const { close } = grpc.invoke(MessengerService.SendContactRequest, {
				request,
				transport: this.transport,
				host: this.host,
				onMessage: (message) =>
					emit(api.berty.messenger.v1.SendContactRequest.Reply.decode(message.serializeBinary())),
				onEnd: (code, msg, trailers) => {
					if (code !== grpc.Code.OK) {
						emit(
							new GRPCError(
								`GRPC SendContactRequest ${
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
	sendMessage = (requestObj = {}) =>
		eventChannel((emit) => {
			const buf = api.berty.messenger.v1.SendMessage.Request.encode(requestObj).finish()
			const request = bertymessenger.SendMessage.Request.deserializeBinary(buf)
			const { close } = grpc.invoke(MessengerService.SendMessage, {
				request,
				transport: this.transport,
				host: this.host,
				onMessage: (message) =>
					emit(api.berty.messenger.v1.SendMessage.Reply.decode(message.serializeBinary())),
				onEnd: (code, msg, trailers) => {
					if (code !== grpc.Code.OK) {
						emit(
							new GRPCError(
								`GRPC SendMessage ${grpc.Code[code]} (${code}): ${msg}\nTrailers: ${JSON.stringify(
									trailers,
								)}`,
							),
						)
					}
					emit(END)
				},
			})
			return close
		})
	sendAck = (requestObj = {}) =>
		eventChannel((emit) => {
			const buf = api.berty.messenger.v1.SendAck.Request.encode(requestObj).finish()
			const request = bertymessenger.SendAck.Request.deserializeBinary(buf)
			const { close } = grpc.invoke(MessengerService.SendAck, {
				request,
				transport: this.transport,
				host: this.host,
				onMessage: (message) =>
					emit(api.berty.messenger.v1.SendAck.Reply.decode(message.serializeBinary())),
				onEnd: (code, msg, trailers) => {
					if (code !== grpc.Code.OK) {
						emit(
							new GRPCError(
								`GRPC SendAck ${grpc.Code[code]} (${code}): ${msg}\nTrailers: ${JSON.stringify(
									trailers,
								)}`,
							),
						)
					}
					emit(END)
				},
			})
			return close
		})
	systemInfo = (requestObj = {}) =>
		eventChannel((emit) => {
			const buf = api.berty.messenger.v1.SystemInfo.Request.encode(requestObj).finish()
			const request = bertymessenger.SystemInfo.Request.deserializeBinary(buf)
			const { close } = grpc.invoke(MessengerService.SystemInfo, {
				request,
				transport: this.transport,
				host: this.host,
				onMessage: (message) =>
					emit(api.berty.messenger.v1.SystemInfo.Reply.decode(message.serializeBinary())),
				onEnd: (code, msg, trailers) => {
					if (code !== grpc.Code.OK) {
						emit(
							new GRPCError(
								`GRPC SystemInfo ${grpc.Code[code]} (${code}): ${msg}\nTrailers: ${JSON.stringify(
									trailers,
								)}`,
							),
						)
					}
					emit(END)
				},
			})
			return close
		})
}
