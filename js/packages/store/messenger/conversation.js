import { put, select, takeEvery, call } from 'redux-saga/effects'
import { berty } from '@berty-tech/api'

import { strToBuf, bufToStr, jsonToBuf, bufToJSON, unaryChan } from '../utils'
import groups from '../groups'
import contact, { contactPkToGroupPk } from './contact'
import { AppMessageType } from './AppMessage'
import * as faker from '../../components/faker'
import createSagaSlice from '../createSagaSlice'
import * as protocol from '../protocol'
import account from './account'
import message from './message'

export const ConversationKind = {
	OneToOne: 'OneToOne',
	MultiMember: 'MultiMember',
	Self: 'Self',
}

const initialState = {
	events: [],
	aggregates: {},
}

const eventsDef = {
	deleted: (state, { payload }) => {
		// Delete conversation
		delete state.aggregates[payload.aggregateId]
		return state
	},
	deletedFake: (state) => {
		for (const conv of Object.values(state.aggregates)) {
			if (conv.fake) {
				delete state.aggregates[conv.id]
			}
		}
		return state
	},
	generated: (state, { payload }) => {
		const { convs } = payload
		for (const conv of convs) {
			state.aggregates[conv.id] = conv
		}
		return state
	},
	generatedMsg: (state, { payload }) => {
		const { msgs } = payload
		for (const msg of msgs) {
			state.aggregates[payload.id].messages.push(msg.id)
		}
		return state
	},
	created: (state, { payload }) => {
		const { pk, title, now, shareableGroup } = payload
		// Create id
		if (!state.aggregates[pk]) {
			const base = {
				id: pk,
				title,
				pk,
				fake: false,
				shareableGroup,
				createdAt: now,
				members: [],
				messages: [],
				membersNames: {},
				unreadCount: 0,
				reading: false,
			}
			if (payload.kind === ConversationKind.OneToOne) {
				const oneToOne = { ...base, contactId: payload.contactId, kind: payload.kind }
				state.aggregates[pk] = oneToOne
			} else if (payload.kind === ConversationKind.MultiMember) {
				state.aggregates[pk] = { ...base, kind: payload.kind }
			}
		} else {
			const conv = state.aggregates[pk]
			if (shareableGroup) {
				conv.shareableGroup = shareableGroup
			}
			if (title && title !== 'Unknown') {
				conv.title = title
			}
		}
		return state
	},
	nameUpdated: (state, { payload }) => {
		const { aggregateId, name } = payload
		if (state.aggregates[aggregateId]) {
			state.aggregates[aggregateId].title = name
			if (payload.shareableGroup) {
				state.aggregates[aggregateId].shareableGroup = payload.shareableGroup
			}
		}
		return state
	},
	userNameUpdated: (state, { payload }) => {
		const { aggregateId, userName, memberPk } = payload
		const conversation = state.aggregates[aggregateId]
		if (conversation) {
			if (!conversation.membersNames[memberPk]) {
				conversation.membersNames[memberPk] = userName
			}
		}
		return state
	},
	messageAdded: (state, { payload }) => {
		const conv = state.aggregates[payload.aggregateId]
		if (conv) {
			if (!conv.messages) {
				conv.messages = []
			}
			conv.messages.push(payload.messageId)
			if (payload.isMe) {
				conv.lastSentMessage = payload.messageId
			} else if (!conv.reading) {
				conv.unreadCount += 1
			}
			conv.lastMessageDate = payload.lastMessageDate
		}
		return state
	},
	startRead: (state, { payload: id }) => {
		const conv = state.aggregates[id]
		if (conv) {
			conv.unreadCount = 0
			conv.reading = true
		}
		return state
	},
	stopRead: (state, { payload: id }) => {
		const conv = state.aggregates[id]
		if (conv) {
			conv.reading = false
		}
		return state
	},
	appInit: (state) => {
		for (const conv of Object.values(state.aggregates)) {
			conv.reading = false
		}
		return state
	},
}

const queries = {
	getAggregates: (state) => state.messenger.conversation.aggregates,
	list: (state) => Object.values(queries.getAggregates(state)),
	listHuman: (state) =>
		queries
			.list(state)
			.filter(
				(conv) =>
					conv.kind === ConversationKind.OneToOne || conv.kind === ConversationKind.MultiMember,
			),
	get: (state, { id }) => queries.getAggregates(state)[id],
	getLength: (state) => queries.list().length,
	getFakeLength: (state) => queries.list(state).filter((e) => e?.fake).length,
	searchByTitle: (state, { searchText }) =>
		queries.list().filter((conv) => searchText?.toLowerCase().includes(conv.title?.toLowerCase())),
}

const txs = ({ events }) => ({
	open: function* () {
		yield put(events.appInit())
	},
	createOneToOne: function* (payload) {
		if (payload.kind !== ConversationKind.OneToOne) {
			return
		}
		const group = yield select((state) => groups.queries.get(state, { groupId: payload.pk }))
		if (group) {
			if (Object.keys(group.membersDevices).length > 1) {
				const c = yield contact.sq.get({ id: payload.contactId })
				if (c && !c.request.accepted) {
					yield put(contact.events.requestAccepted({ id: contact.id }))
				}
				//
			}
		}

		yield put(events.created(payload))
	},
})

const commands = ({ events, transactions, sq }) => ({
	deleteFake: function* () {
		yield* contact.transactions.deleteFake()
		yield* message.transactions.deleteFake()
		yield put(events.deletedFake())
	},
	generate: function* ({ length }) {
		const contacts = yield* contact.transactions.generate({ length })
		const index = yield sq.getFakeLength()
		const convs = faker.fakeConversations(length, index)
		for (const conv of convs) {
			const c = contacts.find((e) => conv.id === e.id)
			conv.membersNames = {
				...conv.membersNames,
				[c.id]: c.name,
			}
			conv.contactId = c.id
			conv.title = c.name
			conv.pk = c.publicKey
			conv.messages = []
			const messages = yield* message.transactions.generate({ length: 10 })
			for (const msg of messages) {
				conv.messages.push(msg.id)
			}
			conv.lastMessageDate = messages[messages.length - 1].sentDate
		}
		yield put(
			events.generated({
				convs,
			}),
		)
		return convs
	},
	generateMsg: function* ({ length }) {
		const convs = yield select((state) => queries.list(state))
		for (const conv of convs) {
			if (conv.fake) {
				const msgs = yield* message.transactions.generate({ length })
				yield put(events.generatedMsg({ msgs, id: conv.id }))
			}
		}
	},
	create: function* ({ members, name }) {
		console.log('creat/conv', members, name)

		const createReply = yield* unaryChan(
			protocol.client.getProtocolService().multiMemberGroupCreate,
		)
		const { groupPk } = createReply
		if (!groupPk) {
			console.error('failed to create multimembergroup, no groupPk in reply')
			return
		}
		console.log('creat/conv groupPk', groupPk)
		const groupPkStr = bufToStr(groupPk)

		console.log('creat/conv after app metadata send')

		console.log('creating group invitation')

		const rep = yield* unaryChan(
			protocol.client.getProtocolService().multiMemberGroupInvitationCreate,
			{ groupPk },
		)

		const { group } = rep

		if (!group) {
			console.error('no group in invitationCreate reply')
			return
		}

		console.log('created invitation')

		if (
			!(
				group.publicKey &&
				group.secret &&
				group.secretSig &&
				group.groupType === berty.types.v1.GroupType.GroupTypeMultiMember
			)
		) {
			console.error('malformed group in invitationCreate reply')
			return
		}

		console.log('setting group name')

		const setGroupName = {
			type: AppMessageType.SetGroupName,
			name,
		}
		yield* protocol.client.transactions.appMetadataSend({
			groupPk,
			payload: jsonToBuf(setGroupName),
		})

		console.log('subscribing')

		yield put(
			groups.commands.subscribe({
				publicKey: groupPkStr,
				metadata: true,
				messages: true,
			}),
		)

		console.log('geting link')

		// get shareable group

		const reply = yield* protocol.client.transactions.shareableBertyGroup({
			groupPk: group.publicKey,
			groupName: name,
		})

		console.log('puting created event')

		yield put(
			events.created({
				kind: ConversationKind.MultiMember,
				title: name,
				pk: groupPkStr,
				now: Date.now(),
				shareableGroup: reply.deepLink || undefined,
			}),
		)

		const a = yield select((state) => account.queries.get(state))
		if (!a) {
			console.warn('no account')
			return
		}
		const groupInfo = yield call(protocol.transactions.client.groupInfo, {
			groupPk,
			contactPk: new Uint8Array(),
		})
		const setUserName = {
			type: AppMessageType.SetUserName,
			userName: a.name,
			memberPk: bufToStr(groupInfo.memberPk),
		}
		yield* protocol.client.transactions.appMetadataSend({
			groupPk,
			payload: jsonToBuf(setUserName),
		})

		console.log('creat/conv after multiMemberGroupJoin')

		console.log('invitation: ', rep)

		const invitation = {
			type: AppMessageType.GroupInvitation,
			name,
			group: {
				publicKey: groupPkStr,
				secret: bufToStr(group.secret),
				secretSig: bufToStr(group.secretSig),
				groupType: group.groupType,
			},
		}
		console.log('before invitations', members)
		for (const member of members) {
			let oneToOnePk = member.groupPk
			if (!oneToOnePk) {
				const pkbuf = yield* contactPkToGroupPk({ contactPk: member.publicKey })
				oneToOnePk = pkbuf && bufToStr(pkbuf)
			}
			console.log('after create oneToOnePk', oneToOnePk)
			if (oneToOnePk) {
				yield* protocol.client.transactions.appMessageSend({
					// TODO: replace with appMessageSend
					groupPk: strToBuf(oneToOnePk),
					payload: jsonToBuf(invitation),
				})
			} else {
				console.warn(
					'Tried to send a multimember group invitation to a contact without an established 1to1',
				)
			}
		}
	},
	join: function* ({ link }) {
		const reply = yield* protocol.client.transactions.parseDeepLink({
			link,
		})
		try {
			if (
				!(
					reply &&
					reply.kind === berty.messenger.v1.ParseDeepLink.Kind.BertyGroup &&
					reply.bertyGroup?.group &&
					reply.bertyGroup.displayName &&
					reply.bertyGroup.group.publicKey
				)
			) {
				throw new Error('Invalid link')
			}
			yield put(
				events.created({
					kind: ConversationKind.MultiMember,
					title: reply.bertyGroup.displayName,
					pk: bufToStr(reply.bertyGroup.group.publicKey),
					now: Date.now(),
				}),
			)
			yield* protocol.client.transactions.multiMemberGroupJoin({
				group: reply.bertyGroup?.group,
			})
		} catch (e) {
			console.warn('Failed to join multi-member group:', e)
		}
	},
	delete: function* ({ id }) {
		const conv = yield select((state) => queries.get(state, { id }))
		if (!conv) {
			return
		}
		yield call(groups.transactions.unsubscribe, {
			publicKey: conv.pk,
			metadata: true,
			messages: true,
		})
		yield put(
			events.deleted({
				aggregateId: id,
			}),
		)
	},
	deleteAll: function* () {
		// Recup conversations
		const conversations = yield select(queries.list)
		// Delete conversations
		for (const conversation of conversations) {
			yield* transactions.delete({ id: conversation.id })
		}
	},
	addMessage: function* ({ aggregateId, messageId, isMe }) {
		yield put(
			events.messageAdded({
				aggregateId,
				messageId,
				isMe,
				lastMessageDate: Date.now(),
			}),
		)
	},
	startRead: function* (id) {
		yield put(events.startRead(id))
	},
	stopRead: function* (id) {
		yield put(events.stopRead(id))
	},
})

const effects = ({ events, transactions }) => [
	takeEvery(protocol.events.client.accountContactRequestOutgoingEnqueued, function* ({ payload }) {
		const {
			event: { contact: c },
		} = payload
		// Recup metadata
		if (!c || !c.metadata || !c.pk) {
			throw new Error('Invalid contact')
		}
		const contactPk = payload.event.contact.pk
		if (!contactPk) {
			return
		}
		const groupInfo = yield* protocol.transactions.client.groupInfo({
			contactPk,
		})
		const { group } = groupInfo
		if (!group) {
			return
		}
		const { publicKey: groupPk } = group
		if (!groupPk) {
			return
		}
		const groupPkStr = bufToStr(groupPk)
		const metadata = bufToJSON(c.metadata)
		yield call(transactions.createOneToOne, {
			title: metadata.name,
			pk: groupPkStr,
			kind: ConversationKind.OneToOne,
			contactId: bufToStr(c.pk),
			now: Date.now(),
		})
	}),
	takeEvery(protocol.events.client.accountGroupJoined, function* ({ payload }) {
		const {
			event: { group },
			eventContext: { groupPk },
		} = payload
		const { publicKey, groupType } = group
		if (groupType !== berty.types.v1.GroupType.GroupTypeMultiMember || !groupPk) {
			return
		}
		if (!publicKey) {
			throw new Error('Invalid public key')
		}
		yield call(protocol.client.transactions.activateGroup, { groupPk: publicKey })
		let reply
		try {
			reply = yield* protocol.client.transactions.shareableBertyGroup({
				groupPk: publicKey,
				groupName: 'Unknown',
			})
		} catch (e) {
			console.warn('Failed to get deep link for group')
		}
		yield put(
			events.created({
				title: 'Unknown',
				pk: bufToStr(publicKey),
				kind: ConversationKind.MultiMember,
				now: Date.now(),
				shareableGroup: reply?.deepLink || undefined,
			}),
		)
		yield put(
			groups.commands.subscribe({
				publicKey: bufToStr(publicKey),
				messages: true,
				metadata: true,
			}),
		)
		const a = yield select((state) => account.queries.get(state))
		if (!a) {
			console.warn('account not found')
			return
		}
		const groupInfo = yield call(protocol.transactions.client.groupInfo, {
			groupPk: publicKey,
			contactPk: new Uint8Array(),
		})
		const setUserName = {
			type: AppMessageType.SetUserName,
			userName: a.name,
			memberPk: bufToStr(groupInfo.memberPk),
		}
		yield* protocol.client.transactions.appMetadataSend({
			groupPk: publicKey,
			payload: jsonToBuf(setUserName),
		})
	}),
	takeEvery(protocol.events.client.groupMetadataPayloadSent, function* ({ payload }) {
		const {
			eventContext: { groupPk },
		} = payload
		const event = payload.event
		if (!groupPk) {
			return
		}
		const id = bufToStr(groupPk)
		const conversation = yield select((state) => queries.get(state, { id }))
		if (!conversation) {
			return
		}
		if (event && event.type === AppMessageType.SetGroupName) {
			let reply
			try {
				reply = yield* protocol.client.transactions.shareableBertyGroup({
					groupPk,
					groupName: event.name,
				})
			} catch (e) {
				console.warn('Failed to get deep link for group')
			}
			yield put(
				events.nameUpdated({
					aggregateId: id,
					name: event.name,
					shareableGroup: reply?.deepLink || undefined,
				}),
			)
		}
		if (event && event.type === AppMessageType.SetUserName) {
			yield put(
				events.userNameUpdated({
					aggregateId: id,
					userName: event.userName,
					memberPk: event.memberPk,
				}),
			)
		}
	}),
]

export default createSagaSlice({
	name: 'conversation',
	path: 'messenger',
	initialState,
	events: eventsDef,
	transactions: txs,
	commands,
	effects,
	queries,
	exports: {
		ConversationKind,
	},
})
