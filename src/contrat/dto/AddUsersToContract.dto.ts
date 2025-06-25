import { ApiProperty } from '@nestjs/swagger';

class AddUsersToContractDto {
  @ApiProperty({
    description: 'Liste des IDs des utilisateurs à ajouter au contrat',
    example: ['user-123', 'user-456'],
    type: [String]
  })
  utilisateursIds: string[];
}

export default AddUsersToContractDto;
