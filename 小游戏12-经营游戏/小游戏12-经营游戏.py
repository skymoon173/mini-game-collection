import pygame
import sys

# 初始化 Pygame
pygame.init()

# 设置屏幕大小
SCREEN_WIDTH, SCREEN_HEIGHT = 800, 600
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption('Farm Game')

# 定义颜色
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
GREEN = (0, 255, 0)
BROWN = (139, 69, 19)

# 加载图像
crop_images = {
    'wheat': pygame.image.load('wheat.png').convert_alpha(),
    'corn': pygame.image.load('corn.png').convert_alpha()
}
farmer_image = pygame.image.load('farmer.png').convert_alpha()

# 玩家类
class Player:
    def __init__(self):
        self.money = 100
        self.seeds = {'wheat': 5, 'corn': 3}

# 作物类
class Crop:
    def __init__(self, name, growth_time, value, seed_price):
        self.name = name
        self.growth_time = growth_time
        self.value = value
        self.seed_price = seed_price

# 农场类
class Farm:
    def __init__(self, size):
        self.fields = [{'crop': None, 'days_left': 0} for _ in range(size)]
    
    def grow_crops(self):
        for field in self.fields:
            if field['crop'] and field['days_left'] > 0:
                field['days_left'] -= 1
    
    def plant_crop(self, crop, field_index):
        if self.fields[field_index]['crop'] is None:
            self.fields[field_index] = {'crop': crop, 'days_left': crop.growth_time}
        else:
            print("Field is already occupied.")
    
    def harvest_crop(self, field_index):
        if self.fields[field_index]['crop'] and self.fields[field_index]['days_left'] == 0:
            crop = self.fields[field_index]['crop']
            self.fields[field_index] = {'crop': None, 'days_left': 0}
            return crop
        else:
            print("Crop is not ready for harvest.")
            return None

# 游戏类
class Game:
    def __init__(self):
        self.player = Player()
        self.farm = Farm(5)
        self.day = 1
        self.crops = {
            'wheat': Crop('wheat', 3, 10, 2),
            'corn': Crop('corn', 5, 20, 3)
        }
        self.farmer_pos = [50, 150]
        self.farmer_speed = 5
    
    def start(self):
        running = True
        while running:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
            
            keys = pygame.key.get_pressed()
            if keys[pygame.K_LEFT]:
                self.farmer_pos[0] -= self.farmer_speed
            if keys[pygame.K_RIGHT]:
                self.farmer_pos[0] += self.farmer_speed
            if keys[pygame.K_UP]:
                self.farmer_pos[1] -= self.farmer_speed
            if keys[pygame.K_DOWN]:
                self.farmer_pos[1] += self.farmer_speed
            if keys[pygame.K_SPACE]:
                self.handle_action()

            self.farm.grow_crops()
            self.draw()
            pygame.display.flip()
            pygame.time.delay(1000)
            self.day += 1
        
        pygame.quit()
        sys.exit()
    
    def handle_action(self):
        x, y = self.farmer_pos
        field_index = x // 160
        if 150 <= y < 300:
            self.plant_crop(field_index)
        elif 300 <= y < 450:
            self.harvest_crop(field_index)
    
    def plant_crop(self, field_index):
        crop_name = 'wheat'  # Example: always plant wheat
        if crop_name in self.crops and self.player.seeds[crop_name] > 0:
            crop = self.crops[crop_name]
            self.farm.plant_crop(crop, field_index)
            self.player.seeds[crop_name] -= 1
    
    def harvest_crop(self, field_index):
        crop = self.farm.harvest_crop(field_index)
        if crop:
            self.player.money += crop.value
    
    def draw(self):
        screen.fill(WHITE)
        
        # 画农田
        for i, field in enumerate(self.farm.fields):
            x = i * 160
            y = 150
            pygame.draw.rect(screen, BROWN, (x, y, 150, 150))
            if field['crop']:
                crop_name = field['crop'].name
                screen.blit(crop_images[crop_name], (x + 25, y + 25))
                days_left = field['days_left']
                font = pygame.font.Font(None, 36)
                text = font.render(str(days_left), True, BLACK)
                screen.blit(text, (x + 60, y + 60))
        
        # 画小人
        screen.blit(farmer_image, self.farmer_pos)
        
        # 画状态
        font = pygame.font.Font(None, 36)
        money_text = font.render(f"Money: {self.player.money}", True, BLACK)
        screen.blit(money_text, (10, 10))
        seeds_text = font.render(f"Seeds - Wheat: {self.player.seeds['wheat']}, Corn: {self.player.seeds['corn']}", True, BLACK)
        screen.blit(seeds_text, (10, 50))
        day_text = font.render(f"Day: {self.day}", True, BLACK)
        screen.blit(day_text, (10, 90))

if __name__ == "__main__":
    game = Game()
    game.start()
