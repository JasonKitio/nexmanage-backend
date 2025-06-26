import { WebSocketGateway, SubscribeMessage, MessageBody, WebSocketServer, ConnectedSocket } from "@nestjs/websockets"
import  { Server, Socket } from "socket.io"
import { forwardRef, Inject } from "@nestjs/common"
import { MessageService } from "./message.service"
import { CreateMessageDto } from "./dto/create-message.dto"

@WebSocketGateway({
  cors: {
    origin: "*",
  },
  namespace: "messages",
})
export class MessageGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    @Inject(forwardRef(() => MessageService))
    private readonly messageService: MessageService,
  ) {
    console.log("MessageService injected:", !!this.messageService)
  }

  // ÉVÉNEMENTS POUR LA MESSAGERIE PAR ENTREPRISE

  @SubscribeMessage("joinEntrepriseRoom")
  handleJoinEntrepriseRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; entrepriseId: string },
  ) {
    const room = `entreprise_${data.entrepriseId}_user_${data.userId}`
    client.join(room)
    client.join(`user_${data.userId}`) // Pour les notifications individuelles
    return { event: "joinedEntrepriseRoom", data: { room, userId: data.userId, entrepriseId: data.entrepriseId } }
  }

  @SubscribeMessage("leaveEntrepriseRoom")
  handleLeaveEntrepriseRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; entrepriseId: string },
  ) {
    const room = `entreprise_${data.entrepriseId}_user_${data.userId}`
    client.leave(room)
    client.leave(`user_${data.userId}`)
    return { event: "leftEntrepriseRoom", data: { room, userId: data.userId, entrepriseId: data.entrepriseId } }
  }

  @SubscribeMessage("sendMessageInEntreprise")
  async handleSendMessageInEntreprise(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { entrepriseId: string; createMessageDto: CreateMessageDto },
  ) {
    try {
      const message = await this.messageService.createForEntreprise(data.entrepriseId, data.createMessageDto)

      // Émettre le message au destinataire dans le contexte de l'entreprise
      const destinataireRoom = `entreprise_${data.entrepriseId}_user_${data.createMessageDto.destinataireId}`
      this.server.to(destinataireRoom).emit("newMessageInEntreprise", {
        message,
        entrepriseId: data.entrepriseId,
      })

      return { event: "messageSentInEntreprise", data: message }
    } catch (error) {
      return { event: "messageError", data: { error: error.message } }
    }
  }

  @SubscribeMessage("markAsReadInEntreprise")
  async handleMarkAsReadInEntreprise(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { entrepriseId: string; messageId: string; userId: string },
  ) {
    try {
      const message = await this.messageService.markAsReadInEntreprise(data.entrepriseId, data.messageId, data.userId)

      // Notifier l'expéditeur que le message a été lu
      const expediteurRoom = `entreprise_${data.entrepriseId}_user_${message.expediteurId}`
      this.server.to(expediteurRoom).emit("messageReadInEntreprise", {
        messageId: data.messageId,
        readBy: data.userId,
        entrepriseId: data.entrepriseId,
      })

      return { event: "messageReadInEntreprise", data: message }
    } catch (error) {
      return { event: "markAsReadError", data: { error: error.message } }
    }
  }

  @SubscribeMessage("joinConversationInEntreprise")
  handleJoinConversationInEntreprise(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; otherUserId: string; entrepriseId: string },
  ) {
    const conversationRoom = `entreprise_${data.entrepriseId}_conversation_${[data.userId, data.otherUserId].sort().join("_")}`
    client.join(conversationRoom)
    return { event: "joinedConversationInEntreprise", data: { room: conversationRoom } }
  }

  @SubscribeMessage("leaveConversationInEntreprise")
  handleLeaveConversationInEntreprise(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; otherUserId: string; entrepriseId: string },
  ) {
    const conversationRoom = `entreprise_${data.entrepriseId}_conversation_${[data.userId, data.otherUserId].sort().join("_")}`
    client.leave(conversationRoom)
    return { event: "leftConversationInEntreprise", data: { room: conversationRoom } }
  }

  @SubscribeMessage("broadcastToEntreprise")
  async handleBroadcastToEntreprise(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { entrepriseId: string; expediteurId: string; contenu: string },
  ) {
    try {
      const messages = await this.messageService.broadcastToEntreprise(
        data.entrepriseId,
        data.expediteurId,
        data.contenu,
      )

      // Émettre à tous les utilisateurs de l'entreprise
      messages.forEach((message) => {
        const destinataireRoom = `entreprise_${data.entrepriseId}_user_${message.destinataireId}`
        this.server.to(destinataireRoom).emit("broadcastMessageReceived", {
          message,
          entrepriseId: data.entrepriseId,
        })
      })

      return { event: "broadcastSent", data: { messageCount: messages.length } }
    } catch (error) {
      return { event: "broadcastError", data: { error: error.message } }
    }
  }

  // MÉTHODES UTILITAIRES

  // Envoyer une notification à un utilisateur spécifique
  sendNotificationToUser(userId: string, notification: any) {
    const room = `user_${userId}`
    this.server.to(room).emit("nouvelle_notification", notification)
    console.log(`Notification envoyée à l'utilisateur ${userId}:`, notification)
  }

  // Envoyer une notification à tous les utilisateurs d'une entreprise
  sendNotificationToEntreprise(entrepriseId: string, notification: any) {
    const room = `entreprise_${entrepriseId}`
    this.server.to(room).emit("notification_entreprise", notification)
    console.log(`Notification envoyée à l'entreprise ${entrepriseId}:`, notification)
  }

  // Envoyer une notification à tous les admins d'une entreprise
  sendNotificationToCompanyAdmins(adminIds: string[], notification: any) {
    adminIds.forEach((adminId) => {
      this.sendNotificationToUser(adminId, notification)
    })
  }

  // ÉVÉNEMENTS EXISTANTS (pour compatibilité)

  @SubscribeMessage("joinRoom")
  handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() userId: string) {
    client.join(`user_${userId}`)
    return { event: "joinedRoom", data: userId }
  }

  @SubscribeMessage("leaveRoom")
  handleLeaveRoom(@ConnectedSocket() client: Socket, @MessageBody() userId: string) {
    client.leave(`user_${userId}`)
    return { event: "leftRoom", data: userId }
  }

  @SubscribeMessage("sendMessage")
  async handleSendMessage(@ConnectedSocket() client: Socket, @MessageBody() createMessageDto: CreateMessageDto) {
    const message = await this.messageService.create(createMessageDto)

    // Émettre le message au destinataire
    this.server.to(`user_${createMessageDto.destinataireId}`).emit("newMessage", message)

    return { event: "messageSent", data: message }
  }

  @SubscribeMessage("markAsRead")
  async handleMarkAsRead(@ConnectedSocket() client: Socket, @MessageBody() messageId: string) {
    const message = await this.messageService.markAsRead(messageId)
    return { event: "messageRead", data: message }
  }
}
