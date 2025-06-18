import { Controller, Get, Post, Patch, Param, Delete, Headers,Body } from "@nestjs/common"
import  { ContractService } from "./contract.service"
import  {
  CreateContractDto,
  UpdateContractDto,
  AddTaskToContractDto,
  PointageContratDto,
  SaveAsTemplateDto,
  CreateFromTemplateDto,
} from "./dto/create-contrat.dto"

@Controller("contracts")
export class ContractController {
  constructor(private readonly contractService: ContractService) {}

  @Post()
  async create( @Body()createContractDto: CreateContractDto, @Headers('timezone') timezone?: string) {
    return this.contractService.create(createContractDto, timezone)
  }

  @Get()
  async findAll() {
    return this.contractService.findAll()
  }

  @Get("templates")
  async getAllTemplates() {
    return this.contractService.getAllTemplates()
  }

  @Get('employee/:employeeId')
  async findContractsByEmployeeId(@Param('employeeId') employeeId: string) {
    return this.contractService.findContractsByEmployeeId(employeeId);
  }

  @Get("presences")
  async findAllPresences() {
    return this.contractService.findAllPresences()
  }

  @Get('presences/employee/:employeeId')
  async findPresencesByEmployeeId(@Param('employeeId') employeeId: string) {
    return this.contractService.findPresencesByEmployeeId(employeeId);
  }

  @Get(":id")
  async findOne(@Param('id') id: string, @Headers('timezone') timezone?: string) {
    const contract = await this.contractService.findOne(id)
    return this.contractService.formatContractForDisplay(contract, timezone)
  }

  @Get(':id/presences')
  async getContractPresences(@Param('id') id: string) {
    return this.contractService.getContractPresences(id);
  }

  @Patch(":id")
  async update(@Param('id') id: string, updateContractDto: UpdateContractDto, @Headers('timezone') timezone?: string) {
    return this.contractService.update(id, updateContractDto, timezone)
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.contractService.remove(id);
  }

  @Post(":id/tasks")
  async addTaskToContract(@Param('id') id: string, addTaskDto: AddTaskToContractDto) {
    return this.contractService.addTaskToContract(id, addTaskDto)
  }

  @Post(":id/pointage")
  async pointagePresence(@Param('id') id: string,  @Body() pointageDto: PointageContratDto,) {
    return this.contractService.pointagePresence(id, pointageDto)
  }

  @Post(":id/save-template")
  async saveAsTemplate(@Param('id') id: string,  @Body()  saveDto: SaveAsTemplateDto) {
    return this.contractService.saveAsTemplate(id, saveDto)
  }

  @Post("from-template")
  async createFromTemplate(createDto: CreateFromTemplateDto) {
    return this.contractService.createFromTemplate(createDto)
  }
}
