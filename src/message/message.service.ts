import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from "@nestjs/common"
import {  Repository } from "typeorm"
import  { Message } from "./entities/message.entity"
import  { CreateMessageDto } from "./dto/create-message.dto"
import  { MessageGateway } from "./message.gateway"
import  { Entreprise } from "../entreprise/entities/entreprise.entity"
import  { UtilisateurEntreprise } from "../UtilisateurEntreprise/entities/utilisateur-entreprise.entity"
import  { Utilisateur } from "../User/entities/utilisateur.entity"
import { InjectRepository } from "@nestjs/typeorm"

@Injectable()
export class MessageService {
  constructor(
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(Entreprise)
    private entrepriseRepository: Repository<Entreprise>,
    @InjectRepository(UtilisateurEntreprise)
    private utilisateurEntrepriseRepository: Repository<UtilisateurEntreprise>,
    @InjectRepository(Utilisateur)
    private utilisateurRepository: Repository<Utilisateur>,
    private websocketGateway: MessageGateway,
  ) {}

  // MÉTHODES POUR LA MESSAGERIE PAR ENTREPRISE

  // Créer un message dans une entreprise
  async createForEntreprise(entrepriseId: string, createMessageDto: CreateMessageDto): Promise<Message> {
    // Vérifier que l'entreprise existe
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    // Vérifier que l'expéditeur et le destinataire appartiennent à l'entreprise
    await this.validateUsersInEntreprise([createMessageDto.expediteurId, createMessageDto.destinataireId], entrepriseId)

    const message = this.messageRepository.create({
      ...createMessageDto,
      entreprise: entreprise,
      entrepriseId: entrepriseId,
    })

    const savedMessage = await this.messageRepository.save(message)

    // Envoyer la notification en temps réel
    const notification = {
      id: savedMessage.id,
      contenu: savedMessage.contenu,
      dateEnvoi: savedMessage.dateEnvoi,
      expediteurId: savedMessage.expediteurId,
      entrepriseId: savedMessage.entrepriseId,
      type: "MESSAGE",
    }

    this.websocketGateway.sendNotificationToUser(createMessageDto.destinataireId, notification)

    return savedMessage
  }

  // Obtenir tous les messages d'un utilisateur dans une entreprise
  async findAllForUserInEntreprise(entrepriseId: string, userId: string): Promise<Message[]> {
    // Vérifier que l'entreprise existe
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    // Vérifier que l'utilisateur appartient à l'entreprise
    await this.validateUsersInEntreprise([userId], entrepriseId)

    return this.messageRepository.find({
      where: [
        { destinataireId: userId, entrepriseId: entrepriseId },
        { expediteurId: userId, entrepriseId: entrepriseId },
      ],
      relations: ["expediteur", "destinataire", "entreprise"],
      order: { dateEnvoi: "DESC" },
    })
  }

  // Obtenir une conversation entre deux utilisateurs dans une entreprise
  async findConversationInEntreprise(entrepriseId: string, user1Id: string, user2Id: string): Promise<Message[]> {
    // Vérifier que l'entreprise existe
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    // Vérifier que les deux utilisateurs appartiennent à l'entreprise
    await this.validateUsersInEntreprise([user1Id, user2Id], entrepriseId)

    return this.messageRepository.find({
      where: [
        { expediteurId: user1Id, destinataireId: user2Id, entrepriseId: entrepriseId },
        { expediteurId: user2Id, destinataireId: user1Id, entrepriseId: entrepriseId },
      ],
      relations: ["expediteur", "destinataire", "entreprise"],
      order: { dateEnvoi: "ASC" },
    })
  }

  // Marquer un message comme lu dans une entreprise
  async markAsReadInEntreprise(entrepriseId: string, messageId: string, userId: string): Promise<Message> {
    const message = await this.messageRepository.findOne({
      where: {
        id: messageId,
        entrepriseId: entrepriseId,
        destinataireId: userId, // Seul le destinataire peut marquer comme lu
      },
      relations: ["entreprise"],
    })

    if (!message) {
      throw new NotFoundException("Message non trouvé ou vous n'avez pas l'autorisation")
    }

    message.lu = true
    return this.messageRepository.save(message)
  }

  // Obtenir le nombre de messages non lus pour un utilisateur dans une entreprise
  async getUnreadCountInEntreprise(entrepriseId: string, userId: string): Promise<number> {
    // Vérifier que l'utilisateur appartient à l'entreprise
    await this.validateUsersInEntreprise([userId], entrepriseId)

    return await this.messageRepository.count({
      where: {
        destinataireId: userId,
        entrepriseId: entrepriseId,
        lu: false,
      },
    })
  }

  // Obtenir tous les utilisateurs de l'entreprise pour la messagerie
  async getUsersInEntreprise(entrepriseId: string): Promise<Utilisateur[]> {
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    const utilisateursEntreprise = await this.utilisateurEntrepriseRepository.find({
      where: { entreprise: { idEntreprise: entrepriseId } },
      relations: ["utilisateur"],
    })

    return utilisateursEntreprise.map((ue) => ue.utilisateur)
  }

  // Obtenir les conversations récentes d'un utilisateur dans une entreprise
  async getRecentConversationsInEntreprise(entrepriseId: string, userId: string): Promise<any[]> {
    await this.validateUsersInEntreprise([userId], entrepriseId)

    const conversations = await this.messageRepository
      .createQueryBuilder("message")
      .leftJoinAndSelect("message.expediteur", "expediteur")
      .leftJoinAndSelect("message.destinataire", "destinataire")
      .where("message.entrepriseId = :entrepriseId", { entrepriseId })
      .andWhere("(message.expediteurId = :userId OR message.destinataireId = :userId)", { userId })
      .orderBy("message.dateEnvoi", "DESC")
      .getMany()

    // Grouper par conversation et garder le message le plus récent
    const conversationsMap = new Map()

    conversations.forEach((message) => {
      const otherUserId = message.expediteurId === userId ? message.destinataireId : message.expediteurId
      const otherUser = message.expediteurId === userId ? message.destinataire : message.expediteur

      if (!conversationsMap.has(otherUserId)) {
        conversationsMap.set(otherUserId, {
          userId: otherUserId,
          user: otherUser,
          lastMessage: message,
          unreadCount: 0,
        })
      }
    })

    // Calculer les messages non lus pour chaque conversation
    for (const [otherUserId, conversation] of conversationsMap) {
      const unreadCount = await this.messageRepository.count({
        where: {
          expediteurId: otherUserId,
          destinataireId: userId,
          entrepriseId: entrepriseId,
          lu: false,
        },
      })
      conversation.unreadCount = unreadCount
    }

    return Array.from(conversationsMap.values()).sort(
      (a, b) => new Date(b.lastMessage.dateEnvoi).getTime() - new Date(a.lastMessage.dateEnvoi).getTime(),
    )
  }

  // Envoyer un message de diffusion à tous les utilisateurs de l'entreprise
  async broadcastToEntreprise(entrepriseId: string, expediteurId: string, contenu: string): Promise<Message[]> {
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    // Vérifier que l'expéditeur appartient à l'entreprise
    await this.validateUsersInEntreprise([expediteurId], entrepriseId)

    // Obtenir tous les utilisateurs de l'entreprise sauf l'expéditeur
    const utilisateurs = await this.getUsersInEntreprise(entrepriseId)
    const destinataires = utilisateurs.filter((u) => u.idUtilisateur !== expediteurId)

    const messages: Message[] = []

    // Créer un message pour chaque destinataire
    for (const destinataire of destinataires) {
      const message = this.messageRepository.create({
        expediteurId,
        destinataireId: destinataire.idUtilisateur,
        contenu: `[DIFFUSION] ${contenu}`,
        entreprise: entreprise,
        entrepriseId: entrepriseId,
      })

      const savedMessage = await this.messageRepository.save(message)
      messages.push(savedMessage)

      // Notification temps réel
      const notification = {
        id: savedMessage.id,
        contenu: savedMessage.contenu,
        dateEnvoi: savedMessage.dateEnvoi,
        expediteurId: savedMessage.expediteurId,
        entrepriseId: savedMessage.entrepriseId,
        type: "BROADCAST_MESSAGE",
      }

      this.websocketGateway.sendNotificationToUser(destinataire.idUtilisateur, notification)
    }

    return messages
  }

  // Obtenir les statistiques de messagerie d'une entreprise
  async getMessagingStatsForEntreprise(entrepriseId: string): Promise<any> {
    const entreprise = await this.entrepriseRepository.findOne({
      where: { idEntreprise: entrepriseId },
    })

    if (!entreprise) {
      throw new NotFoundException(`Entreprise avec l'ID ${entrepriseId} non trouvée`)
    }

    const totalMessages = await this.messageRepository.count({
      where: { entrepriseId: entrepriseId },
    })

    const messagesNonLus = await this.messageRepository.count({
      where: { entrepriseId: entrepriseId, lu: false },
    })

    const messagesAujourdhui = await this.messageRepository.count({
      where: {
        entrepriseId: entrepriseId,
        dateEnvoi: new Date(new Date().toDateString()),
      },
    })

    const utilisateursActifs = await this.messageRepository
      .createQueryBuilder("message")
      .select("DISTINCT message.expediteurId", "expediteurId")
      .where("message.entrepriseId = :entrepriseId", { entrepriseId })
      .andWhere("message.dateEnvoi >= :date", { date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) })
      .getRawMany()

    return {
      entreprise: {
        id: entreprise.idEntreprise,
        nom: entreprise.nom,
      },
      totalMessages,
      messagesNonLus,
      messagesAujourdhui,
      utilisateursActifsSemaine: utilisateursActifs.length,
    }
  }

  // MÉTHODES PRIVÉES

  private async validateUsersInEntreprise(utilisateursIds: string[], entrepriseId: string): Promise<void> {
    for (const utilisateurId of utilisateursIds) {
      const userInEntreprise = await this.utilisateurEntrepriseRepository.findOne({
        where: {
          utilisateur: { idUtilisateur: utilisateurId },
          entreprise: { idEntreprise: entrepriseId },
        },
        relations: ["utilisateur", "entreprise"],
      })

      if (!userInEntreprise) {
        throw new ForbiddenException(`L'utilisateur ${utilisateurId} n'appartient pas à cette entreprise`)
      }
    }
  }

  // MÉTHODES EXISTANTES (pour compatibilité)

  async create(createMessageDto: CreateMessageDto): Promise<Message> {
    const message = this.messageRepository.create(createMessageDto)
    return this.messageRepository.save(message)
  }

  async findAllForUser(userId: string): Promise<Message[]> {
    return this.messageRepository.find({
      where: [{ destinataireId: userId }, { expediteurId: userId }],
      relations: ["expediteur", "destinataire", "entreprise"],
      order: { dateEnvoi: "DESC" },
    })
  }

  async findConversation(user1Id: string, user2Id: string): Promise<Message[]> {
    return this.messageRepository.find({
      where: [
        { expediteurId: user1Id, destinataireId: user2Id },
        { expediteurId: user2Id, destinataireId: user1Id },
      ],
      relations: ["expediteur", "destinataire", "entreprise"],
      order: { dateEnvoi: "ASC" },
    })
  }

  async markAsRead(messageId: string): Promise<Message> {
    const message = await this.messageRepository.findOne({ where: { id: messageId } })
    if (message) {
      message.lu = true
    } else {
      throw new Error("Message not found")
    }
    return this.messageRepository.save(message)
  }

  async createMessage(expediteurId: string, destinataireId: string, contenu: string): Promise<Message> {
    const message = this.messageRepository.create({
      expediteurId,
      destinataireId,
      contenu,
    })

    const savedMessage = await this.messageRepository.save(message)

    const notification = {
      id: savedMessage.id,
      contenu: savedMessage.contenu,
      dateEnvoi: savedMessage.dateEnvoi,
      expediteurId: savedMessage.expediteurId,
      type: "MESSAGE",
    }

    this.websocketGateway.sendNotificationToUser(destinataireId, notification)

    return savedMessage
  }

  async getMessagesForUser(userId: string): Promise<Message[]> {
    return await this.messageRepository.find({
      where: { destinataireId: userId },
      relations: ["expediteur", "entreprise"],
      order: { dateEnvoi: "DESC" },
    })
  }

  async getUnreadCount(userId: string): Promise<number> {
    return await this.messageRepository.count({
      where: { destinataireId: userId, lu: false },
    })
  }
}
