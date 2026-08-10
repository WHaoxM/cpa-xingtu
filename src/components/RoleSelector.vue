<template>
  <div class="role-selector">
    <div class="role-selector__header">
      <h2>选择专家角色</h2>
      <p>与专业领域的专家对话，获取个性化建议</p>
    </div>

    <div class="role-selector__search">
      <el-input
        v-model="searchQuery"
        placeholder="搜索角色名称、职位或专业领域..."
        prefix-icon="Search"
        clearable
      />
    </div>

    <div class="role-selector__grid">
      <div
        v-for="role in filteredRoles"
        :key="role.id"
        :class="['role-card', { 'role-card--selected': selectedRole?.id === role.id }]"
        @click="selectRole(role)"
      >
        <div class="role-card__avatar">
          {{ role.name.charAt(0) }}
        </div>
        <div class="role-card__info">
          <h3 class="role-card__name">{{ role.name }}</h3>
          <p class="role-card__title">{{ role.title }}</p>
          <p class="role-card__company">{{ role.company }}</p>
          <div class="role-card__tags">
            <el-tag
              v-for="tag in parseExpertise(role.expertise)"
              :key="tag"
              size="small"
              type="info"
            >
              {{ tag }}
            </el-tag>
          </div>
        </div>
        <div class="role-card__action">
          <el-button type="primary" size="small">开始对话</el-button>
        </div>
      </div>
    </div>

    <div v-if="filteredRoles.length === 0" class="role-selector__empty">
      <el-empty description="没有找到匹配的角色" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { listRoles, type RoleListItem } from '@/api/roles'

const router = useRouter()
const searchQuery = ref('')
const roles = ref<RoleListItem[]>([])
const selectedRole = ref<RoleListItem | null>(null)

const filteredRoles = computed(() => {
  if (!searchQuery.value) return roles.value
  const query = searchQuery.value.toLowerCase()
  return roles.value.filter(
    (role) =>
      role.name.toLowerCase().includes(query) ||
      role.title.toLowerCase().includes(query) ||
      role.company.toLowerCase().includes(query) ||
      role.expertise.toLowerCase().includes(query)
  )
})

function parseExpertise(expertise: string): string[] {
  return expertise
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
}

function selectRole(role: RoleListItem) {
  selectedRole.value = role
  router.push(`/app/student/roles/${role.id}`)
}

onMounted(async () => {
  try {
    const data = await listRoles()
    roles.value = data.roles || []
  } catch (error) {
    console.error('Failed to load roles:', error)
  }
})
</script>

<style scoped>
.role-selector {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.role-selector__header {
  text-align: center;
  margin-bottom: 32px;
}

.role-selector__header h2 {
  font-size: 28px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 8px;
}

.role-selector__header p {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.role-selector__search {
  margin-bottom: 24px;
  max-width: 400px;
  margin-left: auto;
  margin-right: auto;
}

.role-selector__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.role-card {
  background: var(--color-bg-card, #fff);
  border-radius: 12px;
  padding: 20px;
  box-shadow: var(--shadow-sm, 0 2px 8px rgba(0, 0, 0, 0.08));
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
}

.role-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md, 0 4px 16px rgba(0, 0, 0, 0.12));
}

.role-card--selected {
  border: 2px solid var(--color-primary, #409eff);
}

.role-card__avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-primary, #409eff), #67c23a);
  color: white;
  font-size: 24px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.role-card__info {
  flex: 1;
}

.role-card__name {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.role-card__title {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 2px;
}

.role-card__company {
  font-size: 13px;
  color: var(--color-text-tertiary, #999);
  margin-bottom: 12px;
}

.role-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.role-card__action {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.role-selector__empty {
  padding: 40px 0;
}
</style>
