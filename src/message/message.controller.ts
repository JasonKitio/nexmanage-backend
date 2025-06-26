import { Controller, Get, Post, Body, Param, UseGuards, Request, ValidationPipe, ParseUUIDPipe } from "@nestjs/common"
import  { MessageService } from "./message.service"
import  { CreateMessageDto } from "./dto/create-message.dto"
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard"
import { ApiTags, ApiOperation, ApiParam } from "@nestjs/swagger"

@UseGuards(JwtAuthGuard)
@ApiTags("messages")
@Controller("messages")
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  // ENDPOINTS POUR LA MESSAGERIE PAR ENTREPRISE

  @Post("entreprise/:entrepriseId")
  @ApiOperation({
    summary: "Créer un message dans une entreprise",
    description: "Envoie un message entre deux utilisateurs de la même entreprise",
  })
  @ApiParam({
    name: "entrepriseId",
    description: "ID de l'entreprise",
    type: "string",
  })
  async createForEntreprise( @Param('entrepriseId') entrepriseId: string,  createMessageDto: CreateMessageDto) {
    return {
      success: true,
      message: "Message envoyé avec succès",
      data: await this.messageService.createForEntreprise(entrepriseId, createMessageDto),
    }
  }

  @Get("entreprise/:entrepriseId/user/:userId")
  @ApiOperation({
    summary: "Obtenir tous les messages d'un utilisateur dans une entreprise",
    description: "Récupère tous les messages envoyés et reçus par un utilisateur dans une entreprise",
  })
  async findAllForUserInEntreprise( @Param('entrepriseId') entrepriseId: string,  userId: string) {
    return {
      success: true,
      data: await this.messageService.findAllForUserInEntreprise(entrepriseId, userId),
    }
  }

  @Get("entreprise/:entrepriseId/conversation/:user1Id/:user2Id")
  @ApiOperation({
    summary: "Obtenir une conversation entre deux utilisateurs dans une entreprise",
    description: "Récupère l'historique complet d'une conversation entre deux utilisateurs",
  })
  async findConversationInEntreprise( @Param('entrepriseId') entrepriseId: string,  user1Id: string, user2Id: string) {
    return {
      success: true,
      data: await this.messageService.findConversationInEntreprise(entrepriseId, user1Id, user2Id),
    }
  }

  @Post("entreprise/:entrepriseId/:messageId/read")
  @ApiOperation({
    summary: "Marquer un message comme lu dans une entreprise",
    description: "Marque un message spécifique comme lu par le destinataire",
  })
  async markAsReadInEntreprise( @Param('entrepriseId') entrepriseId: string,  messageId: string, req) {
    return {
      success: true,
      message: "Message marqué comme lu",
      data: await this.messageService.markAsReadInEntreprise(entrepriseId, messageId, req.user.userId),
    }
  }

  @Get("entreprise/:entrepriseId/unread-count/:userId")
  @ApiOperation({
    summary: "Obtenir le nombre de messages non lus d'un utilisateur dans une entreprise",
    description: "Retourne le nombre de messages non lus pour un utilisateur spécifique",
  })
  async getUnreadCountInEntreprise( @Param('entrepriseId') entrepriseId: string,  userId: string) {
    const count = await this.messageService.getUnreadCountInEntreprise(entrepriseId, userId)
    return {
      success: true,
      data: { count },
    }
  }

  @Get("entreprise/:entrepriseId/users")
  @ApiOperation({
    summary: "Obtenir tous les utilisateurs de l'entreprise pour la messagerie",
    description: "Récupère la liste des utilisateurs avec qui on peut communiquer dans l'entreprise",
  })
  async getUsersInEntreprise( @Param('entrepriseId') entrepriseId: string, ) {
    return {
      success: true,
      data: await this.messageService.getUsersInEntreprise(entrepriseId),
    }
  }

  @Get("entreprise/:entrepriseId/conversations/:userId")
  @ApiOperation({
    summary: "Obtenir les conversations récentes d'un utilisateur dans une entreprise",
    description: "Récupère la liste des conversations avec le dernier message et le nombre de non lus",
  })
  async getRecentConversationsInEntreprise( @Param('entrepriseId') entrepriseId: string,  userId: string) {
    return {
      success: true,
      data: await this.messageService.getRecentConversationsInEntreprise(entrepriseId, userId),
    }
  }

  @Post("entreprise/:entrepriseId/broadcast")
  @ApiOperation({
    summary: "Envoyer un message de diffusion à tous les utilisateurs de l'entreprise",
    description: "Envoie un message à tous les membres de l'entreprise",
  })
  async broadcastToEntreprise( @Param('entrepriseId') entrepriseId: string,  body: { expediteurId: string; contenu: string }) {
    return {
      success: true,
      message: "Message de diffusion envoyé avec succès",
      data: await this.messageService.broadcastToEntreprise(entrepriseId, body.expediteurId, body.contenu),
    }
  }

  @Get("entreprise/:entrepriseId/statistiques")
  @ApiOperation({
    summary: "Obtenir les statistiques de messagerie d'une entreprise",
    description: "Récupère les statistiques détaillées de la messagerie de l'entreprise",
  })
  async getMessagingStatsForEntreprise( @Param('entrepriseId') entrepriseId: string, ) {
    return {
      success: true,
      data: await this.messageService.getMessagingStatsForEntreprise(entrepriseId),
    }
  }


}
