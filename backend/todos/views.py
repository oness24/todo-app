from django.shortcuts import render
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import Todo
from .serializers import TodoSerializer
from .filters import TodoFilter

# Create your views here.

class TodoViewSet(viewsets.ModelViewSet):
    serializer_class = TodoSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_class = TodoFilter

    def get_queryset(self):
        return Todo.objects.filter(user=self.request.user).order_by('order')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['post'])
    def reorder(self, request):
        order = request.data.get('order', [])
        # Ensure all received IDs are integers
        try:
            order_ids = [int(todo_id) for todo_id in order]
        except ValueError:
            return Response({'error': 'Invalid Todo IDs provided.'}, status=400)

        todos_to_update = []
        # Fetch all todos for the user once to minimize DB hits
        user_todos = Todo.objects.filter(user=request.user)
        todo_dict = {todo.id: todo for todo in user_todos}

        for index, todo_id in enumerate(order_ids):
            todo = todo_dict.get(todo_id)
            if todo:
                if todo.order != index:
                    todo.order = index
                    todos_to_update.append(todo)
            else:
                # Handle cases where a provided ID doesn't belong to the user or doesn't exist
                return Response({'error': f'Todo with id {todo_id} not found or not owned by user.'}, status=400)
        
        if todos_to_update:
            Todo.objects.bulk_update(todos_to_update, ['order'])
            
        return Response({'status': 'reordered'})
