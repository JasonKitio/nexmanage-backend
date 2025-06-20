import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { MessageService } from './message.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post()
  create(@Body() createMessageDto: CreateMessageDto) {
    return this.messageService.create(createMessageDto);
  }

  @Get('user/:userId')
  findAllForUser(@Param('userId') userId: string) {
    return this.messageService.findAllForUser(userId);
  }

  @Get('conversation/:user1Id/:user2Id')
  findConversation(
    @Param('user1Id') user1Id: string,
    @Param('user2Id') user2Id: string,
  ) {
    return this.messageService.findConversation(user1Id, user2Id);
  }

  @Post(':id/read')
  markAsRead(@Param('id') id: string) {
    return this.messageService.markAsRead(id);
  }
}