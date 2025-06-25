import { Injectable } from '@nestjs/common';
import { MessageService } from 'src/message/message.service';
import { MessageGateway } from '../message/message.gateway';

@Injectable()
export class NotificationService {
  constructor(
    private messageService: MessageService,
    private websocketGateway: MessageGateway,
  ) {}

  async sendNotification(
    expediteurId: string,
    destinataireId: string,
    title: string,
    message: string,
    type: string,
    data?: any,
  ): Promise<void> {
    // Créer le contenu du message avec le titre et le type
    const contenu = JSON.stringify({
      title,
      message,
      type,
      data: data || {},
    });

    // Sauvegarder le message en base
    const savedMessage = await this.messageService.createMessage(
      expediteurId,
      destinataireId,
      contenu,
    );

    // La notification WebSocket est déjà envoyée par MessageService.createMessage
    console.log(`Notification ${type} envoyée de ${expediteurId} vers ${destinataireId}`);
  }

  async sendNotificationToMultipleUsers(
    expediteurId: string,
    destinataireIds: string[],
    title: string,
    message: string,
    type: string,
    data?: any,
  ): Promise<void> {
    const promises = destinataireIds.map(destinataireId =>
      this.sendNotification(expediteurId, destinataireId, title, message, type, data)
    );

    await Promise.all(promises);
  }
}