import { put, select, call, take } from 'redux-saga/effects'
import GoBridge from '@berty-tech/go-bridge'
import { strToBuf, jsonToBuf } from '../utils'
import createSagaSlice from '../createSagaSlice'

import { commands as groupsCommands } from '../groups'
import * as protocol from '../protocol'
import { events as mainSettingsEvents } from '../settings/main'
import {
	events as conversationEvents,
	transactions as conversationTransactions,
} from './conversation'

import contact from './contact'

const queries = {
	get: (state) => state.messenger.account,
	getRequestRdvSeed: (state) => {
		const account = protocol.queries.client.get(state)
		return (account && account.contactRequestRdvSeed) || undefined
	},
}

const commands = ({ sq, events }) => ({
	open: function* () {
		const acc = yield* sq.get()
		if (!acc) {
			throw new Error("tried to open the account while it's undefined")
		}

		yield put(conversationEvents.appInit())

		yield put(groupsCommands.open())
		yield take('GROUPS_OPENED')

		const client = yield* protocol.client.getProtocolClient()

		yield put(groupsCommands.subscribe({ publicKey: client.accountGroupPk, metadata: true }))

		yield call(protocol.transactions.client.instanceShareableBertyID, {
			reset: false,
			displayName: acc.name,
		})

		yield call(protocol.transactions.client.contactRequestReference)
	},
	generate: function* () {
		throw new Error('not implemented')
		//yield* transactions.create({ name: faker.name.firstName(), config: {} })
	},
	create: function* ({ name, nodeConfig }) {
		yield put(mainSettingsEvents.created({ nodeConfig }))
		yield put(events.created({ name }))
	},
	delete: function* () {
		yield put(events.unboarded())
		yield* protocol.client.transactions.stop()
		yield call(GoBridge.clearStorage)
		yield put({ type: 'CLEAR_STORE' })
	},
	replay: function* () {
		throw new Error('not implemented')
	},
	sendContactRequest: function* (payload) {
		const account = yield select(queries.get)
		if (account == null) {
			throw new Error("account doesn't exist")
		}

		const metadata = {
			name: payload.contactName,
		}

		console.log(
			'sending contact request with\npk:',
			payload.contactPublicKey,
			'\ncrs:',
			payload.contactRdvSeed,
			'\nmetadata:',
			metadata,
		)

		const ownMetadata = {
			name: account.name,
		}

		yield* protocol.transactions.client.contactRequestSend({
			contact: {
				pk: strToBuf(payload.contactPublicKey),
				publicRendezvousSeed: strToBuf(payload.contactRdvSeed),
				metadata: jsonToBuf(metadata),
			},
			ownMetadata: jsonToBuf(ownMetadata),
		})

		console.log('contactRequestSend done')
	},
	onboard: function* () {
		yield put(events.onboarded())
	},
	handleDeepLink: function* ({ url }) {
		if (!protocol.client.services) {
			yield take('APP_READY')
		}
		try {
			const data = yield call(protocol.client.transactions.parseDeepLink, {
				link: url,
			})
			if (!(data && (data.bertyId || data.bertyGroup))) {
				throw new Error('Internal: Invalid node response.')
			}
			let kind
			if (data.bertyGroup) {
				kind = 'group'
				yield* conversationTransactions.join({ link: url })
			} else if (data.bertyId) {
				kind = 'contact'
				yield* contact.transactions.initiateRequest({ url })
			} else {
				kind = 'unknown'
			}
			yield put(events.handleDeepLinkDone({ link: url, kind }))
		} catch (e) {
			if (e.name === 'GRPCError') {
				const error = new Error('Corrupted deep link.').toString()
				yield put(events.handleDeepLinkError({ link: url, error }))
			} else {
				yield put(events.handleDeepLinkError({ link: url, error: e.toString() }))
			}
		}
	},
})

const events = {
	created: (state, { payload }) => {
		if (!state) {
			state = {
				name: payload.name,
				onboarded: false,
			}
		}
		return state
	},
	deleted: () => {
		return null
	},
	onboarded: (state) => {
		if (state) {
			state.onboarded = true
		}
		return state
	},
	unboarded: (state) => {
		if (state) {
			state.onboarded = false
		}
		return state
	},
	handleDeepLinkError: (state, { payload: { link, error } }) => {
		if (state) {
			state.deepLinkStatus = { link, error }
		}
		return state
	},
	handleDeepLinkDone: (state, { payload: { link, kind } }) => {
		if (state) {
			state.deepLinkStatus = { link, kind }
		}
		return state
	},
}

export default createSagaSlice({
	name: 'account',
	path: 'messenger',
	initialState: null,
	commands,
	events,
	queries,
})
