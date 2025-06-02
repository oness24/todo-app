from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from datetime import timedelta

from rest_framework import status
from rest_framework.test import APITestCase

from .models import Todo

User = get_user_model()

class TodoAPITestCase(APITestCase):
    def setUp(self):
        # Create users
        self.user1 = User.objects.create_user(username='user1', password='testpassword123')
        self.user2 = User.objects.create_user(username='user2', password='testpassword123')

        # Authenticate user1
        self.client.force_authenticate(user=self.user1)

        # URLs
        self.list_create_url = reverse('todo-list') # For POST (create) and GET (list)

        # Sample Todo data for user1
        self.todo1_user1 = Todo.objects.create(user=self.user1, title='User1 Todo 1', order=0, priority='M')
        self.todo2_user1 = Todo.objects.create(user=self.user1, title='User1 Todo 2', order=1, priority='H', completed=True)
        self.todo3_user1 = Todo.objects.create(user=self.user1, title='User1 Overdue', order=2, priority='L', due_date=timezone.now() - timedelta(days=1))

        # Sample Todo data for user2 (to test isolation)
        self.todo1_user2 = Todo.objects.create(user=self.user2, title='User2 Todo 1', order=0)

    def detail_url(self, todo_id):
        return reverse('todo-detail', kwargs={'pk': todo_id})

    # --- Test Create ---    
    def test_create_todo_valid(self):
        data = {'title': 'New Test Todo', 'priority': 'L', 'due_date': (timezone.now() + timedelta(days=2)).isoformat()}
        response = self.client.post(self.list_create_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Todo.objects.count(), 5) # 3 for user1, 1 for user2, 1 new
        new_todo = Todo.objects.get(id=response.data['id'])
        self.assertEqual(new_todo.user, self.user1)
        self.assertEqual(new_todo.title, 'New Test Todo')

    def test_create_todo_missing_title(self):
        data = {'priority': 'L'}
        response = self.client.post(self.list_create_url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('title', response.data)

    # --- Test List ---    
    def test_list_todos_for_authenticated_user(self):
        response = self.client.get(self.list_create_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 3) # user1 has 3 todos (assuming default pagination page size is >=3)
        response_titles = [item['title'] for item in response.data['results']]
        self.assertIn(self.todo1_user1.title, response_titles)
        self.assertIn(self.todo2_user1.title, response_titles)
        self.assertNotIn(self.todo1_user2.title, response_titles) # Ensure user2's todo is not listed

    # --- Test Retrieve ---    
    def test_retrieve_own_todo(self):
        response = self.client.get(self.detail_url(self.todo1_user1.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], self.todo1_user1.title)

    def test_retrieve_other_users_todo_forbidden(self):
        response = self.client.get(self.detail_url(self.todo1_user2.id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND) # ViewSet queryset filters by user

    # --- Test Update (PATCH) ---    
    def test_update_own_todo_partially(self):
        data = {'title': 'Updated Title', 'completed': True}
        response = self.client.patch(self.detail_url(self.todo1_user1.id), data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.todo1_user1.refresh_from_db()
        self.assertEqual(self.todo1_user1.title, 'Updated Title')
        self.assertTrue(self.todo1_user1.completed)

    def test_update_other_users_todo_forbidden(self):
        data = {'title': 'Cannot Update This'}
        response = self.client.patch(self.detail_url(self.todo1_user2.id), data)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # --- Test Delete ---    
    def test_delete_own_todo(self):
        response = self.client.delete(self.detail_url(self.todo1_user1.id))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Todo.objects.filter(id=self.todo1_user1.id).exists())
        self.assertEqual(Todo.objects.filter(user=self.user1).count(), 2) # Was 3, now 2

    def test_delete_other_users_todo_forbidden(self):
        response = self.client.delete(self.detail_url(self.todo1_user2.id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Todo.objects.filter(id=self.todo1_user2.id).exists())

    # --- Test Unauthenticated Access ---    
    def test_unauthenticated_access_to_list(self):
        self.client.force_authenticate(user=None) # Logout
        response = self.client.get(self.list_create_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unauthenticated_access_to_detail(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(self.detail_url(self.todo1_user1.id))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # --- Test Reorder ---    
    def test_reorder_todos(self):
        reorder_url = reverse('todo-reorder')
        initial_ids_ordered = [self.todo1_user1.id, self.todo2_user1.id, self.todo3_user1.id]
        new_order_ids = [self.todo3_user1.id, self.todo1_user1.id, self.todo2_user1.id]
        
        response = self.client.post(reorder_url, {'order': new_order_ids}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'reordered')

        # Verify the new order in the database
        self.todo1_user1.refresh_from_db()
        self.todo2_user1.refresh_from_db()
        self.todo3_user1.refresh_from_db()

        self.assertEqual(self.todo3_user1.order, 0)
        self.assertEqual(self.todo1_user1.order, 1)
        self.assertEqual(self.todo2_user1.order, 2)

    # --- Test Filters ---    
    def test_filter_by_status_completed(self):
        response = self.client.get(self.list_create_url, {'status': 'completed'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results']
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], self.todo2_user1.id)
        self.assertTrue(results[0]['completed'])

    def test_filter_by_status_active(self):
        # todo1_user1 is active (not completed, no due date or due date in future)
        # todo3_user1 is overdue, not active
        # Make todo1_user1 have a future due date to be clearly active
        self.todo1_user1.due_date = timezone.now() + timedelta(days=2)
        self.todo1_user1.save()

        response = self.client.get(self.list_create_url, {'status': 'active'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results']
        self.assertEqual(len(results), 1) # Only todo1_user1 should be active
        self.assertEqual(results[0]['id'], self.todo1_user1.id)
        self.assertFalse(results[0]['completed'])

    def test_filter_by_status_overdue(self):
        response = self.client.get(self.list_create_url, {'status': 'overdue'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results']
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], self.todo3_user1.id)
        self.assertFalse(results[0]['completed'])
        self.assertTrue(results[0]['due_date'] < timezone.now().isoformat())

    def test_filter_by_priority(self):
        response = self.client.get(self.list_create_url, {'priority': 'H'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results']
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], self.todo2_user1.id)
        self.assertEqual(results[0]['priority'], 'H')

    def test_search_by_title(self):
        response = self.client.get(self.list_create_url, {'search': 'User1 Todo 1'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results']
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], self.todo1_user1.id)
        self.assertIn('User1 Todo 1', results[0]['title'])

        response_partial = self.client.get(self.list_create_url, {'search': 'Overdue'})
        self.assertEqual(response_partial.status_code, status.HTTP_200_OK)
        results_partial = response_partial.data['results']
        self.assertEqual(len(results_partial), 1)
        self.assertEqual(results_partial[0]['id'], self.todo3_user1.id)
        self.assertIn('Overdue', results_partial[0]['title'])
