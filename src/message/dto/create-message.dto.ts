import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreateMessageDto {
  @IsNotEmpty()
  contenu: string;

  @IsUUID()
  @IsNotEmpty()
  expediteurId: string;

  @IsUUID()
  @IsNotEmpty()
  destinataireId: string;
}