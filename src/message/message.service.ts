import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './entities/message.entity';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class MessageService {
  constructor(
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
  ) {}

  async create(createMessageDto: CreateMessageDto): Promise<Message> {
    const message = this.messageRepository.create(createMessageDto);
    return this.messageRepository.save(message);
  }

  async findAllForUser(userId: string): Promise<Message[]> {
    return this.messageRepository.find({
      where: [
        { destinataireId: userId },
        { expediteurId: userId }
      ],
      relations: ['expediteur', 'destinataire'],
      order: { dateEnvoi: 'DESC' }
    });
  }

  async findConversation(user1Id: string, user2Id: string): Promise<Message[]> {
    return this.messageRepository.find({
      where: [
        { expediteurId: user1Id, destinataireId: user2Id },
        { expediteurId: user2Id, destinataireId: user1Id }
      ],
      relations: ['expediteur', 'destinataire'],
      order: { dateEnvoi: 'ASC' }
    });
  }

  async markAsRead(messageId: string): Promise<Message> {
    const message = await this.messageRepository.findOne({ where: { id: messageId } });
if (message) {
  message.lu = true;
} else {
  throw new Error('Message not found');
}
    return this.messageRepository.save(message);
  }
}