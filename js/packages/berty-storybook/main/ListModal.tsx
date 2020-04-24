import React from 'react'
import {
	View,
	SafeAreaView,
	ScrollView,
	TouchableOpacity,
	StyleSheet,
	Dimensions,
	TouchableWithoutFeedback,
} from 'react-native'
import { Text, Icon } from 'react-native-ui-kitten'
import { useStyles } from '@berty-tech/styles'
import { BlurView } from '@react-native-community/blur'
import { ProceduralCircleAvatar } from '../shared-components/ProceduralCircleAvatar'
import { useNavigation, Routes } from '@berty-tech/berty-navigation'
import { Chat } from '@berty-tech/hooks'
import { chat } from '@berty-tech/store'
import { CommonActions } from '@react-navigation/core'
import MainModal from './MainModal'

const useStylesList = () => {
	const [
		{ absolute, margin, padding, width, height, border, background, row, column },
	] = useStyles()
	return {
		tinyAvatar: [absolute.scale({ top: -32.5 }), row.item.justify],
		tinyCard: [
			margin.medium,
			margin.top.scale(42),
			padding.medium,
			padding.top.scale(42),
			height(177),
			border.radius.large,
			background.white,
			column.justify,
		],
		tinyAcceptButton: [padding.vertical.scale(5), padding.horizontal.small, border.radius.scale(6)],
		tinyDiscardButton: [
			padding.scale(5),
			margin.right.small,
			border.radius.scale(6),
			border.color.light.grey,
		],
		addContactItem: [height(115), width(150)],
		addContactItemText: width(75),
	}
}

const RequestsItem: React.FC<chat.contact.Entity> = ({ name, request, publicKey }) => {
	const { dispatch } = useNavigation()
	const _styles = useStylesList()
	const [{ border, column, flex, row, padding, text, background, color }] = useStyles()
	if (request.type !== chat.contact.ContactRequestType.Outgoing) {
		return <Text>Error: This is an outgoing request</Text>
	}
	return (
		<TouchableOpacity
			style={[_styles.tinyCard, border.shadow.medium, column.justify]}
			onPress={() =>
				dispatch(
					CommonActions.navigate({
						name: Routes.Main.RequestSent,
						params: {
							contact: {
								name,
								publicKey,
							},
						},
					}),
				)
			}
		>
			<ProceduralCircleAvatar
				style={[_styles.tinyAvatar]}
				seed={publicKey}
				size={65}
				diffSize={15}
			/>
			<Text style={[flex.tiny, text.align.center]}>{name}</Text>
			<Text
				category='c1'
				style={[padding.vertical.medium, text.align.center, text.size.tiny, text.color.grey]}
			>
				{request.sent ? 'Sent 3 days ago' : 'Not sent yet'}
			</Text>
			<View style={[row.fill]}>
				<TouchableOpacity style={[_styles.tinyDiscardButton, border.scale(1), row.item.justify]}>
					<Icon name='close-outline' width={20} height={20} fill={color.grey} />
				</TouchableOpacity>
				<TouchableOpacity
					disabled={!request.sent}
					style={[_styles.tinyAcceptButton, background.light.green, row.fill]}
				>
					<View style={[row.item.justify, padding.right.scale(3)]}>
						<Icon
							name='paper-plane-outline'
							width={17}
							height={17}
							fill={color.green}
							style={column.justify}
						/>
					</View>
					<Text style={[text.color.green, text.align.center, text.size.tiny, row.item.justify]}>
						Resend
					</Text>
				</TouchableOpacity>
			</View>
		</TouchableOpacity>
	)
}

const Requests: React.FC<{}> = () => {
	const [{ padding }] = useStyles()

	const requests = Chat.useAccountContactsWithOutgoingRequests().filter(
		(contact) => !(contact.request.accepted || contact.request.discarded),
	)

	return (
		<SafeAreaView>
			<View style={[padding.vertical.medium]}>
				<ScrollView horizontal showsHorizontalScrollIndicator={false}>
					{requests.map((req) => (
						<RequestsItem key={req.id} {...req} />
					))}
				</ScrollView>
			</View>
		</SafeAreaView>
	)
}

const AddContact: React.FC<{}> = () => {
	const navigation = useNavigation()
	const _styles = useStylesList()
	const [{ padding, row, column, border, background, color, text }] = useStyles()

	return (
		<View style={[padding.vertical.medium]}>
			<View style={[row.center]}>
				<TouchableOpacity
					style={[
						background.red,
						padding.medium,
						border.radius.medium,
						column.justify,
						_styles.addContactItem,
					]}
					onPress={navigation.navigate.main.scan}
				>
					<View style={[row.fill]}>
						<View />
						<Icon name='image-outline' height={50} width={50} fill={color.white} />
					</View>
					<View style={[row.fill]}>
						<Text numberOfLines={2} style={[text.color.white, _styles.addContactItemText]}>
							Scan QR code
						</Text>
						<View />
					</View>
				</TouchableOpacity>
				<TouchableOpacity
					style={[
						background.blue,
						padding.medium,
						border.radius.medium,
						column.justify,
						_styles.addContactItem,
					]}
					onPress={navigation.navigate.settings.myBertyId}
				>
					<View style={[row.fill]}>
						<View />
						<Icon name='person-outline' height={50} width={50} fill={color.white} />
					</View>
					<View style={[row.fill]}>
						<Text numberOfLines={2} style={[text.color.white, _styles.addContactItemText]}>
							Share my Berty ID
						</Text>
						<View />
					</View>
				</TouchableOpacity>
			</View>
		</View>
	)
}

const NewGroup: React.FC<{}> = () => <View />

const Screen = Dimensions.get('window')

export const ListModal: React.FC = () => {
	const navigation = useNavigation()
	return (
		<MainModal
			blurAmount={2}
			easing="ease-in-out"
			duration={300}
			items={[
				{
					header: (
						<View style={{ borderColor: 'black', borderWidth: 1 }}>
							<Text
								style={{
									textAlign: 'center',
									borderBottomColor: 'black',
									borderBottomWidth: 1,
								}}
							>
								Add contact
							</Text>
						</View>
					),
					content: <AddContact />,
				},
				{
					header: (
						<View style={{ borderColor: 'black', borderWidth: 1 }}>
							<Text
								style={{
									textAlign: 'center',
								}}
							>
								Requests
							</Text>
						</View>
					),
					content: <Requests />,
				},
				{
					header: (
						<View style={{ borderColor: 'black', borderWidth: 1 }}>
							<Text
								style={{ textAlign: 'center', borderBottomColor: 'black', borderBottomWidth: 1 }}
							>
								New group
							</Text>
						</View>
					),
					onPress: navigation.navigate.main.createGroup.createGroup2,
				},
			]}
			closeModal={navigation.goBack}
		/>
	)
}
