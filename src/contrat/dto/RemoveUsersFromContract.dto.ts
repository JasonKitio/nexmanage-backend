import { ApiProperty } from '@nestjs/swagger';

class RemoveUsersFromContractDto {
  @ApiProperty({
    description: 'Liste des IDs des utilisateurs à retirer du contrat',
    example: ['user-123', 'user-456'],
    type: [String]
  })
  utilisateursIds: string[];
}

export default RemoveUsersFromContractDto;
