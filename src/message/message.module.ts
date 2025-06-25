import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageService } from './message.service';
import { MessageController } from './message.controller';
import { MessageGateway } from './message.gateway';
import { Message } from './entities/message.entity';
import { AuthModule } from '../auth/auth.module';
import { CongeModule } from '../conge/conge.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message]),
    forwardRef(() => AuthModule),
    forwardRef(() => CongeModule),
  ],
  controllers: [MessageController],
  providers: [
    MessageService, 
    MessageGateway
  ],
  exports: [
    MessageService,
    MessageGateway
  ],
})
export class MessageModule {}