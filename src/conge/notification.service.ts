import { Injectable } from '@nestjs/common';
import { MessageService } from 'src/message/message.service';
import { MessageGateway } from '../message/message.gateway';

@Injectable()
export class NotificationService {
  constructor(
    private messageService: MessageService,
    private readonly websocketGateway: MessageGateway,
  ) {}

 async sendNotification(
  entrepriseId: string,
  expediteurId: string,
  destinataireId: string,
  title: string,
  message: string,
  type: string,
  data?: any,
): Promise<void> {
  const contenu = JSON.stringify({
    title,
    message,
    type,
    data: data || {},
  });

  await this.messageService.createForEntreprise(entrepriseId, {
    expediteurId,
    destinataireId,
    contenu,
  });

  console.log(`Notification ${type} envoyée de ${expediteurId} vers ${destinataireId}`);
}

  async sendNotificationToMultipleUsers(
    entrepriseId: string,
    expediteurId: string,
    destinataireIds: string[],
    title: string,
    message: string,
    type: string,
    data?: any,
  ): Promise<void> {
    const promises = destinataireIds.map(destinataireId =>
      this.sendNotification(entrepriseId, expediteurId, destinataireId, title, message, type, data)
    );

    await Promise.all(promises);
  }
}