import { IsEnum, IsOptional, IsString } from 'class-validator';
import { StatutConge } from 'src/utils/enums/enums';

export class UpdateStatutCongeDto {
  @IsEnum(StatutConge)
  statut: StatutConge;

  @IsOptional()
  @IsString()
  motifRefus?: string;
}
