import { IsString, MinLength, Matches } from "class-validator"
import { ApiProperty } from "@nestjs/swagger"

export class ChangePasswordDto {
  @ApiProperty({
    description: "Nouveau mot de passe",
    example: "MonNouveauMotDePasse123!",
  })
  @IsString()
  @MinLength(8, { message: "Le mot de passe doit contenir au moins 8 caractères" })
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: "Le mot de passe doit contenir au moins une majuscule, un chiffre et un caractère spécial",
  })
  nouveauMotDePasse: string
}
