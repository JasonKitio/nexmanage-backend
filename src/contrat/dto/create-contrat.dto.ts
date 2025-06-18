import { IsArray, IsBoolean, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateContractDto {
  @IsArray()
  @IsNumber({}, { each: true })
  lieu: number[]; // [latitude, longitude]

  @IsDateString()
  dateDebut: Date;

  @IsDateString()
  dateFin: Date;

  @IsOptional()
  @IsString()
  description?: string;

 
  @IsOptional()
  @IsString()
  pause?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  utilisateursIds?: string[]; // Plusieurs utilisateurs possibles

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tachesIds?: string[];

  @IsOptional()
  @IsNumber()
  nombreJoursRepetition?: number;
}

export class UpdateContractDto {
@IsArray()
  @IsNumber({}, { each: true })
  lieu: number[]; // [latitude, longitude]

  @IsOptional()
  @IsDateString()
  dateDebut?: Date;

  @IsOptional()
  @IsDateString()
  dateFin?: Date;

  @IsOptional()
  @IsString()
  description?: string;


  @IsOptional()
  @IsString()
  pause?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  utilisateursIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  tachesIds?: string[];
}

export class PointageContratDto {
  @IsUUID()
  utilisateurId: string;

  @IsArray()
  @IsNumber({}, { each: true })
  localisation: number[]; // [latitude, longitude]

  @IsOptional()
  @IsDateString()
  heureDepart?: Date;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddTaskToContractDto {
  @IsUUID()
  tacheId: string;
}


export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  contenu: string;

  @IsUUID()
  emetteurId: string;

  @IsOptional()
  @IsUUID()
  destinataireId?: string;
}

export class SaveAsTemplateDto {
  @IsString()
  @IsNotEmpty()
  nomGabarit: string;
}

export class CreateFromTemplateDto {
  @IsUUID()
  gabaritId: string;

  @IsArray()
  @IsUUID('4', { each: true })
  utilisateursIds: string[];

  @IsOptional()
  @IsDateString()
  dateDebut?: Date;

  @IsOptional()
  @IsDateString()
  dateFin?: Date;

   @IsArray()
  @IsNumber({}, { each: true })
  lieu: number[]; // [latitude, longitude]
}
