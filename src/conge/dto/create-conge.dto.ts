import { IsNotEmpty, IsString, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCongeDto {
  @IsNotEmpty()
  @IsString()
  motif: string;

  @IsNotEmpty()
  @IsDateString()
  dateDebut: string;

  @IsNotEmpty()
  dateFin: string;
}